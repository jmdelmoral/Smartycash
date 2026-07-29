import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import { buildMovementWhere, parsePagination } from '@/lib/cartola-filters';
import { Prisma } from '@/lib/generated/prisma';
import { applyMovement, movementBalanceError, type AuditEvent } from '@/lib/cartola-write';
import { createDisplayIdAllocator } from '@/lib/cartola-display';
import {
  cartolaToUi,
  moduleFromIdentification,
  movementStatusFromDocuments,
  parseDateInput,
  uiIdentificationToPrisma,
} from '@/lib/business-mappers';
import prisma from '@/lib/prisma';

const documentSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  amount: z.coerce.number().positive(),
  detail: z.string().optional().default(''),
});

const movementSchema = z.object({
  movementId: z.string().min(1),
  ownerUserId: z.string().optional(),
  amount: z.coerce.number().positive(),
  bank: z.string().min(1),
  bankAccount: z.string().min(1),
  country: z.string().min(1),
  description: z.string().min(1),
  date: z.string().min(1),
  extraFields: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
  mainIdentification: z.enum([
    'Sin identificar',
    'Adquiriente',
    'GC',
    'Cobranza crédito',
    'Abono débito',
  ]),
  mainIdentificationId: z.string().optional().default(''),
  documents: z.array(documentSchema),
});

const payloadSchema = z.object({
  movements: z.array(movementSchema),
  // IDs the client had loaded (baseline). Used to scope reversals so we never
  // touch records created concurrently by other users. Optional for back-compat.
  knownIds: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Cartola')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const where = buildMovementWhere(searchParams);
  const { paginate, page, pageSize } = parsePagination(searchParams);

  // Backward compatible: with no `pageSize` param we return the full filtered
  // set (legacy behaviour). With `pageSize` we paginate and also report `total`.
  const [total, rows] = await prisma.$transaction([
    prisma.cartolaMovement.count({ where }),
    prisma.cartolaMovement.findMany({
      where,
      include: { allocations: { include: { saleReference: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      ...(paginate && pageSize ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
  ]);

  return NextResponse.json({
    movements: rows.map(cartolaToUi),
    total,
    page: paginate ? page : 1,
    pageSize: paginate && pageSize ? pageSize : total,
  });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Cartola')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  if (parsed.data.movements.length === 0) {
    return NextResponse.json(
      { error: 'Sincronización vacía omitida para evitar borrado masivo' },
      { status: 400 }
    );
  }

  for (const movement of parsed.data.movements) {
    const balanceError = movementBalanceError(movement);
    if (balanceError) {
      return NextResponse.json({ error: balanceError }, { status: 400 });
    }
  }

  const movementIds = parsed.data.movements.map((movement) => movement.movementId);
  const payloadIdSet = new Set(movementIds);
  // Only reverse records the client knew about and dropped. When knownIds is
  // absent we fall back to the legacy behaviour (reverse everything not sent).
  const reverseIdFilter = parsed.data.knownIds
    ? { in: parsed.data.knownIds.filter((id) => !payloadIdSet.has(id)) }
    : { notIn: movementIds.length > 0 ? movementIds : [''] };
  const auditEvents: Array<{
    action: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  }> = [];

  await prisma.$transaction(async (tx) => {
    const existingMovements = await tx.cartolaMovement.findMany({
      where: { id: { in: movementIds.length > 0 ? movementIds : [''] } },
      include: { allocations: true },
    });
    const existingById = new Map(existingMovements.map((movement) => [movement.id, movement]));
    // Un solo cálculo del correlativo por lote (evita el timeout P2028).
    const allocate = createDisplayIdAllocator(tx);

    const movementsToReverse = await tx.cartolaMovement.findMany({
      where: {
        id: reverseIdFilter,
        status: { not: 'Reversed' },
      },
      select: { id: true, status: true },
    });

    await tx.cartolaMovement.updateMany({
      where: {
        id: reverseIdFilter,
        status: { not: 'Reversed' },
      },
      data: { status: 'Reversed' },
    });

    for (const reversed of movementsToReverse) {
      auditEvents.push({
        action: 'movement_reversed',
        entityId: reversed.id,
        before: { status: reversed.status },
        after: { status: 'Reversed' },
      });
    }

    for (const movement of parsed.data.movements) {
      const previous = existingById.get(movement.movementId);
      const nextStatus = movementStatusFromDocuments(movement);
      const nextIdentificationType = uiIdentificationToPrisma(movement.mainIdentification);
      const bankAccount = await tx.bankAccount.findFirst({
        where: {
          accountNumber: movement.bankAccount,
          bankName: movement.bank,
          country: movement.country,
        },
      });

      const displayId = previous?.displayId ? undefined : await allocate(movement);

      await tx.cartolaMovement.upsert({
        where: { id: movement.movementId },
        update: {
          displayId,
          bankAccountId: bankAccount?.id,
          bank: movement.bank,
          bankAccountNumber: movement.bankAccount,
          country: movement.country,
          amount: movement.amount,
          date: parseDateInput(movement.date),
          description: movement.description,
          extraFields: movement.extraFields,
          identificationType: nextIdentificationType,
          status: nextStatus,
          ownerUserId: session.user.id,
        },
        create: {
          id: movement.movementId,
          displayId,
          bankAccountId: bankAccount?.id,
          bank: movement.bank,
          bankAccountNumber: movement.bankAccount,
          country: movement.country,
          amount: movement.amount,
          date: parseDateInput(movement.date),
          description: movement.description,
          extraFields: movement.extraFields,
          identificationType: nextIdentificationType,
          status: nextStatus,
          ownerUserId: session.user.id,
        },
      });

      if (!previous) {
        auditEvents.push({
          action: 'movement_created',
          entityId: movement.movementId,
          after: {
            status: nextStatus,
            amount: movement.amount,
            identificationType: nextIdentificationType,
          },
        });
      } else {
        if (previous.status !== nextStatus) {
          auditEvents.push({
            action: 'movement_status_changed',
            entityId: movement.movementId,
            before: { status: previous.status },
            after: { status: nextStatus },
          });
        }

        if (previous.identificationType !== nextIdentificationType) {
          auditEvents.push({
            action: 'movement_identification_changed',
            entityId: movement.movementId,
            before: { identificationType: previous.identificationType },
            after: { identificationType: nextIdentificationType },
          });
        }
      }

      await tx.cartolaMovementAllocation.deleteMany({
        where: { movementId: movement.movementId },
      });

      for (const document of movement.documents) {
        const saleReference = await tx.saleReference.upsert({
          where: { type_reference: { type: 'PNR', reference: document.reference } },
          update: {},
          create: { type: 'PNR', reference: document.reference },
        });

        await tx.cartolaMovementAllocation.create({
          data: {
            movementId: movement.movementId,
            module: moduleFromIdentification(movement.mainIdentification),
            sourceEntityType: 'CartolaDocument',
            sourceEntityId: document.id,
            saleReferenceId: saleReference.id,
            amount: document.amount,
            detail: document.detail,
            createdById: session.user.id,
          },
        });
      }

      const previousAllocationKeys =
        previous?.allocations
          .map((allocation) => `${allocation.sourceEntityId}:${allocation.amount.toString()}`)
          .sort() ?? [];
      const nextAllocationKeys = movement.documents
        .map((document) => `${document.id}:${document.amount.toString()}`)
        .sort();

      if (JSON.stringify(previousAllocationKeys) !== JSON.stringify(nextAllocationKeys)) {
        auditEvents.push({
          action: 'movement_allocations_changed',
          entityId: movement.movementId,
          before: { allocations: previousAllocationKeys },
          after: { allocations: nextAllocationKeys },
        });
      }
    }
    for (const event of auditEvents) {
      await auditAction(
        {
          actorId: session.user.id,
          action: event.action,
          module: 'Cartola',
          entityType: 'CartolaMovement',
          entityId: event.entityId,
          before: event.before,
          after: event.after,
          metadata: event.metadata,
          request,
        },
        tx
      );
    }

    await auditAction(
      {
        actorId: session.user.id,
        action: 'bulk_sync',
        module: 'Cartola',
        entityType: 'CartolaMovement',
        entityId: 'snapshot',
        metadata: { count: parsed.data.movements.length },
        request,
      },
      tx
    );
  }, { timeout: 30000, maxWait: 15000 });

  return NextResponse.json({ ok: true });
}


const createPayloadSchema = z.object({
  movements: z.array(movementSchema).min(1),
});

/**
 * Create or edit movements ONE-BY-ONE (or in a batch, e.g. CSV upload) without
 * the destructive "reverse everything not sent" behaviour. This is the write
 * path used by the paginated frontend, where the client no longer holds the
 * full dataset in memory.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Cartola')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = createPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  for (const movement of parsed.data.movements) {
    const balanceError = movementBalanceError(movement);
    if (balanceError) {
      return NextResponse.json({ error: balanceError }, { status: 400 });
    }
  }

  // Reintenta ante colisión de unicidad en displayId (P2002): dos escrituras
  // casi simultáneas podrían calcular el mismo correlativo. Reintentar recalcula
  // el correlativo con el estado ya persistido por la otra transacción.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    const auditEvents: AuditEvent[] = [];
    try {
      await prisma.$transaction(
        async (tx) => {
          // Un solo cálculo del correlativo por lote (no por movimiento).
          const allocate = createDisplayIdAllocator(tx);
          for (const movement of parsed.data.movements) {
            await applyMovement(tx, movement, session.user.id, auditEvents, allocate);
          }
          for (const event of auditEvents) {
            await auditAction(
              {
                actorId: session.user.id,
                action: event.action,
                module: 'Cartola',
                entityType: 'CartolaMovement',
                entityId: event.entityId,
                before: event.before,
                after: event.after,
                metadata: event.metadata,
                request,
              },
              tx
            );
          }
        },
        // RDS remoto: damos margen para lotes grandes y evitamos el P2028
        // (timeout por defecto de 5s) sin dejarlo colgado indefinidamente.
        { timeout: 30000, maxWait: 15000 }
      );
      break;
    } catch (error) {
      const isDisplayIdCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String((error.meta as { target?: unknown } | undefined)?.target ?? '').includes(
          'displayId'
        );
      if (isDisplayIdCollision && attempt < MAX_ATTEMPTS) continue;
      if (isDisplayIdCollision) {
        return NextResponse.json(
          { error: 'Conflicto al asignar el código visible. Reintenta la sincronización.' },
          { status: 409 }
        );
      }
      // Error inesperado: devolvemos el detalle (en vez de un 500 opaco) para
      // poder diagnosticar. Incluye código Prisma (Pxxxx) y mensaje.
      const detail =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      console.error('[cartola POST] error al sincronizar:', error);
      return NextResponse.json(
        { error: `Error al guardar en base: ${detail}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, count: parsed.data.movements.length }, { status: 201 });
}

const deletePayloadSchema = z.object({
  movementIds: z.array(z.string().min(1)).min(1),
});

/**
 * Reverse (soft-delete) specific movements by id. Replaces the reverse path of
 * the old bulk PUT with an explicit, non-destructive operation.
 */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Cartola')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = deletePayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  // Gate de cierre contable: un movimiento CerradoDefinitivo solo puede
  // reversarse/anularse por Contabilidad o Administrador.
  if (!canRead(session, 'Contabilidad')) {
    const closed = await prisma.cartolaMovement.findFirst({
      where: { id: { in: parsed.data.movementIds }, closeState: 'CerradoDefinitivo' },
      select: { displayId: true, id: true },
    });
    if (closed) {
      return NextResponse.json(
        {
          error: `El movimiento ${closed.displayId ?? closed.id} está CERRADO contablemente. Solo Contabilidad puede reversarlo.`,
        },
        { status: 403 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const toReverse = await tx.cartolaMovement.findMany({
      where: { id: { in: parsed.data.movementIds }, status: { not: 'Reversed' } },
      select: { id: true, status: true },
    });

    await tx.cartolaMovement.updateMany({
      where: { id: { in: parsed.data.movementIds }, status: { not: 'Reversed' } },
      data: { status: 'Reversed' },
    });

    for (const reversed of toReverse) {
      await auditAction(
        {
          actorId: session.user.id,
          action: 'movement_reversed',
          module: 'Cartola',
          entityType: 'CartolaMovement',
          entityId: reversed.id,
          before: { status: reversed.status },
          after: { status: 'Reversed' },
          request,
        },
        tx
      );
    }
  });

  return NextResponse.json({ ok: true });
}

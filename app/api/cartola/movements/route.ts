import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
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
    'Cobranza crÃ©dito',
    'Cobranza crédito',
  ]),
  mainIdentificationId: z.string().optional().default(''),
  documents: z.array(documentSchema),
});

const payloadSchema = z.object({
  movements: z.array(movementSchema),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const movements = await prisma.cartolaMovement.findMany({
    where: { status: { not: 'Reversed' } },
    include: { allocations: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ movements: movements.map(cartolaToUi) });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const movementIds = parsed.data.movements.map((movement) => movement.movementId);
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

    const movementsToReverse = await tx.cartolaMovement.findMany({
      where: {
        id: { notIn: movementIds.length > 0 ? movementIds : [''] },
        status: { not: 'Reversed' },
      },
      select: { id: true, status: true },
    });

    await tx.cartolaMovement.updateMany({
      where: {
        id: { notIn: movementIds.length > 0 ? movementIds : [''] },
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

      await tx.cartolaMovement.upsert({
        where: { id: movement.movementId },
        update: {
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
  });

  for (const event of auditEvents) {
    await auditAction({
      actorId: session.user.id,
      action: event.action,
      module: 'Cartola',
      entityType: 'CartolaMovement',
      entityId: event.entityId,
      before: event.before,
      after: event.after,
      metadata: event.metadata,
      request,
    });
  }

  await auditAction({
    actorId: session.user.id,
    action: 'bulk_sync',
    module: 'Cartola',
    entityType: 'CartolaMovement',
    entityId: 'snapshot',
    metadata: { count: parsed.data.movements.length },
    request,
  });

  return NextResponse.json({ ok: true });
}

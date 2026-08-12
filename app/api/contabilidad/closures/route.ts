import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions, getAppSession } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import prisma from '@/lib/prisma';

const bodySchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
  label: z.string().trim().optional(),
});

/** Lista de cierres (más recientes primero) con su snapshot. */
export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Contabilidad')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }
  const closures = await prisma.closure.findMany({ orderBy: [{ createdAt: 'desc' }] });
  return NextResponse.json({ closures });
}

/** Genera un cierre sobre un rango de fechas. */
export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Contabilidad')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }
  const from = new Date(`${parsed.data.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${parsed.data.dateTo}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  const closureId = await prisma.$transaction(async (tx) => {
    // Incluye: nuevos del rango (Abierto) + todos los pendientes arrastrados.
    const movements = await tx.cartolaMovement.findMany({
      where: {
        status: { not: 'Reversed' },
        OR: [
          { closeState: 'Abierto', date: { gte: from, lte: to } },
          { closeState: 'CerradoParcial' },
        ],
      },
      select: {
        id: true,
        status: true,
        identificationType: true,
        amount: true,
        date: true,
        originYear: true,
        originMonth: true,
        closeState: true,
      },
    });

    // Cierre anterior donde cada arrastrado quedó Parcial (para carriedFromClosureId).
    const carriedIds = movements.filter((m) => m.closeState === 'CerradoParcial').map((m) => m.id);
    const priorItems = carriedIds.length
      ? await tx.closureItem.findMany({
          where: { movementId: { in: carriedIds } },
          orderBy: { createdAt: 'desc' },
          select: { movementId: true, closureId: true },
        })
      : [];
    const lastClosureByMovement = new Map<string, string>();
    for (const it of priorItems) {
      if (!lastClosureByMovement.has(it.movementId)) {
        lastClosureByMovement.set(it.movementId, it.closureId);
      }
    }

    const closure = await tx.closure.create({
      data: {
        label: parsed.data.label ?? null,
        dateFrom: from,
        dateTo: to,
        createdById: session.user.id,
      },
      select: { id: true },
    });

    let identifiedCount = 0;
    let pendingCount = 0;
    let identifiedAmount = 0;
    let pendingAmount = 0;

    for (const m of movements) {
      const identified = m.status === 'FullyAllocated';
      const newState = identified ? 'CerradoDefinitivo' : 'CerradoParcial';
      const amount = Number(m.amount);
      const originYear = m.originYear ?? m.date.getUTCFullYear();
      const originMonth = m.originMonth ?? m.date.getUTCMonth() + 1;
      const carriedFromClosureId =
        m.closeState === 'CerradoParcial' ? (lastClosureByMovement.get(m.id) ?? null) : null;

      await tx.closureItem.create({
        data: {
          closureId: closure.id,
          movementId: m.id,
          closeState: newState,
          identificationType: m.identificationType,
          amount: m.amount,
          originYear,
          originMonth,
          carriedFromClosureId,
        },
      });

      await tx.cartolaMovement.update({
        where: { id: m.id },
        data: {
          closeState: newState,
          finalizedInClosureId: identified ? closure.id : undefined,
          validatedAt: identified ? new Date() : undefined,
        },
      });

      if (identified) {
        identifiedCount += 1;
        identifiedAmount += amount;
      } else {
        pendingCount += 1;
        pendingAmount += amount;
      }
    }

    await tx.closure.update({
      where: { id: closure.id },
      data: {
        totalCount: movements.length,
        identifiedCount,
        pendingCount,
        totalAmount: identifiedAmount + pendingAmount,
        identifiedAmount,
        pendingAmount,
      },
    });

    await auditAction(
      {
        actorId: session.user.id,
        action: 'closure_generated',
        module: 'Contabilidad',
        entityType: 'Closure',
        entityId: closure.id,
        metadata: {
          dateFrom: parsed.data.dateFrom,
          dateTo: parsed.data.dateTo,
          total: movements.length,
          identified: identifiedCount,
          pending: pendingCount,
        },
        request,
      },
      tx
    );

    return closure.id;
  });

  return NextResponse.json({ ok: true, closureId }, { status: 201 });
}

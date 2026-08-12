import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions, getAppSession } from '@/lib/auth';
import { canRead } from '@/lib/authz';
import { summarizeClosureItems } from '@/lib/closure';
import prisma from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/** Detalle de un cierre (para auditoría): cabecera + resumen + detalle por movimiento. */
export async function GET(_request: Request, { params }: Ctx) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Contabilidad')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { id } = await params;
  const closure = await prisma.closure.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          movement: {
            select: {
              id: true,
              displayId: true,
              bank: true,
              bankAccountNumber: true,
              amount: true,
              date: true,
              description: true,
              allocations: { include: { saleReference: true } },
            },
          },
        },
      },
    },
  });
  if (!closure) {
    return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 });
  }

  const summary = summarizeClosureItems(closure.items);

  // Detalle por transacción (con PNRs cuando existan).
  const detalle = closure.items.map((it) => ({
    movementId: it.movementId,
    displayId: it.movement.displayId,
    closeState: it.closeState,
    category: it.identificationType,
    amount: Number(it.amount),
    originYear: it.originYear,
    originMonth: it.originMonth,
    carriedFromClosureId: it.carriedFromClosureId,
    bank: it.movement.bank,
    bankAccount: it.movement.bankAccountNumber,
    date: it.movement.date.toISOString().slice(0, 10),
    description: it.movement.description,
    pnrs: it.movement.allocations
      .filter((a) => !a.voidedAt)
      .map((a) => ({
        reference: a.saleReference?.reference ?? a.sourceEntityId,
        amount: Number(a.amount),
      })),
  }));

  return NextResponse.json({
    closure: {
      id: closure.id,
      label: closure.label,
      dateFrom: closure.dateFrom.toISOString().slice(0, 10),
      dateTo: closure.dateTo.toISOString().slice(0, 10),
      createdAt: closure.createdAt.toISOString(),
      totalCount: closure.totalCount,
      identifiedCount: closure.identifiedCount,
      pendingCount: closure.pendingCount,
      totalAmount: closure.totalAmount ? Number(closure.totalAmount) : null,
      identifiedAmount: closure.identifiedAmount ? Number(closure.identifiedAmount) : null,
      pendingAmount: closure.pendingAmount ? Number(closure.pendingAmount) : null,
    },
    summary,
    detalle,
  });
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions, getAppSession } from '@/lib/auth';
import { canRead } from '@/lib/authz';
import prisma from '@/lib/prisma';

/**
 * Backlog "por identificar": movimientos históricos aún sin identificar
 * (no reversados y no CerradoDefinitivo), con su periodo de origen.
 */
export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Contabilidad')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const movements = await prisma.cartolaMovement.findMany({
    where: {
      status: { not: 'Reversed' },
      identificationType: 'SinIdentificar',
      closeState: { not: 'CerradoDefinitivo' },
    },
    select: {
      id: true,
      bank: true,
      bankAccountNumber: true,
      amount: true,
      date: true,
      description: true,
      originYear: true,
      originMonth: true,
      closeState: true,
    },
    orderBy: [{ date: 'asc' }],
  });

  return NextResponse.json({
    movements: movements.map((m) => ({
      movementId: m.id,
      bank: m.bank,
      bankAccount: m.bankAccountNumber,
      amount: Number(m.amount),
      date: m.date.toISOString().slice(0, 10),
      description: m.description,
      originYear: m.originYear,
      originMonth: m.originMonth,
      closeState: m.closeState,
    })),
    total: movements.length,
  });
}

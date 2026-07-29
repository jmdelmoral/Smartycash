import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { canRead } from '@/lib/authz';
import { buildMovementWhere } from '@/lib/cartola-filters';
import { cartolaToUi } from '@/lib/business-mappers';
import { Prisma } from '@/lib/generated/prisma';
import prisma from '@/lib/prisma';

/**
 * D 4a - Fuentes de pago para Cobranza (abonos en cartola con saldo).
 *
 * Devuelve movimientos 'Sin identificar' o 'Cobranza credito' que todavia tienen
 * saldo disponible (monto - asignaciones no anuladas), buscados en el servidor.
 * ADITIVO: nadie lo consume aun, no altera el flujo actual.
 *
 * Query params (todos opcionales): search, account, dateFrom, dateTo, limit.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Cobranza')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);

  // Reutiliza los filtros opcionales (search/account/fecha) y fuerza el conjunto
  // de identificaciones que sirven como fuente de pago.
  const sp = new URLSearchParams();
  const account = searchParams.get('account');
  if (account) sp.set('account', account);
  const dateFrom = searchParams.get('dateFrom');
  if (dateFrom) sp.set('dateFrom', dateFrom);
  const dateTo = searchParams.get('dateTo');
  if (dateTo) sp.set('dateTo', dateTo);
  const search = searchParams.get('search');
  if (search) sp.set('search', search);

  const where: Prisma.CartolaMovementWhereInput = {
    AND: [
      buildMovementWhere(sp),
      {
        identificationType: {
          in: ['SinIdentificar', 'CobranzaCredito'],
        } as Prisma.CartolaMovementWhereInput['identificationType'],
      },
    ],
  };

  const rows = await prisma.cartolaMovement.findMany({
    where,
    include: { allocations: { include: { saleReference: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });

  // Solo los que conservan saldo disponible (monto - asignaciones no anuladas).
  const sources = rows
    .map((row) => {
      const ui = cartolaToUi(row);
      const used = ui.documents.reduce((sum, d) => sum + d.amount, 0);
      return { ...ui, availableAmount: ui.amount - used };
    })
    .filter((m) => m.availableAmount > 0.01);

  return NextResponse.json({ sources });
}

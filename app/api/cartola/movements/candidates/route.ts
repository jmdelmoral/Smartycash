import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { canRead } from '@/lib/authz';
import { buildMovementWhere } from '@/lib/cartola-filters';
import { cartolaToUi } from '@/lib/business-mappers';
import prisma from '@/lib/prisma';

/**
 * D Fase 2a - Candidatos de movimiento para el match de Recaudacion.
 *
 * Devuelve movimientos "Sin identificar" que calzan con una solicitud, buscados
 * en el servidor (sin necesidad de cargar TODA la cartola en el cliente).
 * Es ADITIVO: nadie lo consume todavia, asi que no altera el flujo actual.
 *
 * Query params:
 *   amount    (obligatorio) monto de la solicitud; se busca +/-1 de tolerancia
 *   account   (opcional)    numero de cuenta bancaria
 *   dateFrom  (opcional)    ISO yyyy-mm-dd
 *   dateTo    (opcional)    ISO yyyy-mm-dd
 *   limit     (opcional)    tope de resultados (default 50, max 100)
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Recaudacion')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawAmount = searchParams.get('amount');
  const amount = rawAmount !== null ? Number(rawAmount) : NaN;
  if (Number.isNaN(amount)) {
    return NextResponse.json({ error: 'Parametro amount requerido' }, { status: 400 });
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);

  // Reutilizamos el mismo builder de filtros de la cartola, forzando:
  //  - identificacion = Sin identificar (solo candidatos libres)
  //  - rango de monto +/-1 (misma tolerancia que el selector manual del cliente)
  const sp = new URLSearchParams();
  sp.set('identification', 'Sin identificar');
  sp.set('amountMin', String(amount - 1));
  sp.set('amountMax', String(amount + 1));
  const account = searchParams.get('account');
  if (account) sp.set('account', account);
  const dateFrom = searchParams.get('dateFrom');
  if (dateFrom) sp.set('dateFrom', dateFrom);
  const dateTo = searchParams.get('dateTo');
  if (dateTo) sp.set('dateTo', dateTo);

  const where = buildMovementWhere(sp);

  const rows = await prisma.cartolaMovement.findMany({
    where,
    include: { allocations: { include: { saleReference: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });

  return NextResponse.json({ candidates: rows.map(cartolaToUi) });
}

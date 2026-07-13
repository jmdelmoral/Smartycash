import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { canRead } from '@/lib/authz';
import { cartolaToUi } from '@/lib/business-mappers';
import { buildMovementWhere } from '@/lib/cartola-filters';
import prisma from '@/lib/prisma';

/**
 * Export endpoint: returns the FULL filtered set (no pagination) so the client
 * can download a whole date range (e.g. a full month). Same filters as the
 * paginated listing. The client builds the spreadsheet from this payload.
 */
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

  const rows = await prisma.cartolaMovement.findMany({
    where,
    include: { allocations: { include: { saleReference: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ movements: rows.map(cartolaToUi), total: rows.length });
}

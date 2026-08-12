import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAppSession } from '@/lib/auth';
import { canRead } from '@/lib/authz';
import { cartolaToUi } from '@/lib/business-mappers';
import prisma from '@/lib/prisma';

/**
 * Fase 5 - Lookup de movimientos por id interno o displayId (código visible
 * CL-BAN-...). Reemplaza el `movements.find` cross-página sobre el array
 * compartido en la carga masiva de detalles PNR de Cartola.
 */
const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Cartola')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }
  const ids = Array.from(new Set(parsed.data.ids));

  const rows = await prisma.cartolaMovement.findMany({
    where: { OR: [{ id: { in: ids } }, { displayId: { in: ids } }] },
    include: { allocations: { include: { saleReference: true } } },
  });

  return NextResponse.json({ movements: rows.map(cartolaToUi) });
}

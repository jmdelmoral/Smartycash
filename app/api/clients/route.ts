import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const clientSchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().trim().min(1),
  navitaireCode: z.string().trim().optional(),
  sapBP: z.string().trim().optional(),
});

const statusSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function canWriteClients(session: Session | null) {
  return getRole(session) === 'Administrador';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!canWriteClients(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = clientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  try {
    const client = await prisma.client.create({
      data: {
        name: parsed.data.name,
        taxId: parsed.data.taxId,
        navitaireCode: parsed.data.navitaireCode || null,
        sapBP: parsed.data.sapBP || null,
        createdById: session?.user?.id,
      },
    });

    await auditAction({
      actorId: session?.user?.id,
      action: 'create',
      module: 'Clientes',
      entityType: 'Client',
      entityId: client.id,
      after: client,
      request,
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear el cliente';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!canWriteClients(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const before = await prisma.client.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const client = await prisma.client.update({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  });

  await auditAction({
    actorId: session?.user?.id,
    action: parsed.data.isActive ? 'activate' : 'deactivate',
    module: 'Clientes',
    entityType: 'Client',
    entityId: client.id,
    before,
    after: client,
    request,
  });

  return NextResponse.json({ client });
}

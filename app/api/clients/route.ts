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

const updateClientSchema = clientSchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function canWriteClients(session: Session | null) {
  return getRole(session) === 'Administrador';
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function nextClientCode() {
  const clients = await prisma.client.findMany({
    where: { appCode: { startsWith: 'CLI-' } },
    select: { appCode: true },
  });

  const nextNumber =
    clients.reduce((max, client) => {
      const value = Number(client.appCode.replace('CLI-', ''));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;

  return `CLI-${String(nextNumber).padStart(6, '0')}`;
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
    const appCode = await nextClientCode();
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          appCode,
          name: parsed.data.name,
          taxId: parsed.data.taxId,
          navitaireCode: normalizeOptional(parsed.data.navitaireCode),
          sapBP: normalizeOptional(parsed.data.sapBP),
          createdById: session?.user?.id,
        },
      });

      await auditAction(
        {
          actorId: session?.user?.id,
          action: 'create',
          module: 'Clientes',
          entityType: 'Client',
          entityId: created.id,
          after: created,
          request,
        },
        tx
      );

      return created;
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

  const parsed = updateClientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const before = await prisma.client.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const client = await prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.taxId !== undefined ? { taxId: parsed.data.taxId } : {}),
        ...(parsed.data.navitaireCode !== undefined
          ? { navitaireCode: normalizeOptional(parsed.data.navitaireCode) }
          : {}),
        ...(parsed.data.sapBP !== undefined ? { sapBP: normalizeOptional(parsed.data.sapBP) } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });

    await auditAction(
      {
        actorId: session?.user?.id,
        action:
          parsed.data.isActive === false
            ? 'deactivate'
            : parsed.data.isActive === true && before.isActive === false
              ? 'activate'
              : 'update',
        module: 'Clientes',
        entityType: 'Client',
        entityId: updated.id,
        before,
        after: updated,
        request,
      },
      tx
    );

    return updated;
  });

  return NextResponse.json({ client });
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions, getAppSession } from '@/lib/auth';
import { normalizeCountry } from '@/lib/countries';
import prisma from '@/lib/prisma';

const clientSchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().trim().min(1),
  navitaireCode: z.string().trim().optional(),
  sapBP: z.string().trim().optional(),
  country: z.string().trim().min(1).optional(),
});

const updateClientSchema = clientSchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  validationStatus: z.enum(['Pendiente', 'Validado']).optional(),
});

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

// #9 Quién puede CREAR clientes: el Agente CC también, pero sus clientes quedan
// "Pendiente" de validación. Los roles validadores crean ya "Validado".
const CLIENT_CREATE_ROLES = ['Administrador', 'AgenteCC', 'Recaudacion', 'Cobranza'];
// Quién puede VALIDAR / editar / desactivar clientes (no el Agente CC).
const CLIENT_MANAGE_ROLES = ['Administrador', 'Recaudacion', 'Cobranza'];

function canCreateClients(session: Session | null) {
  const role = getRole(session);
  return !!role && CLIENT_CREATE_ROLES.includes(role);
}

function canManageClients(session: Session | null) {
  const role = getRole(session);
  return !!role && CLIENT_MANAGE_ROLES.includes(role);
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
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!canCreateClients(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = clientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  // El Agente CC crea clientes "Pendiente" de validación; el resto (Admin/
  // Recaudación/Cobranza) los crea ya "Validado".
  const isAgente = getRole(session) === 'AgenteCC';

  // País: vacío → Chile; si viene, debe ser válido.
  const country = parsed.data.country?.trim() ? normalizeCountry(parsed.data.country) : 'Chile';
  if (!country) {
    return NextResponse.json({ error: 'País no válido.' }, { status: 400 });
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
          country,
          createdById: session?.user?.id,
          validationStatus: isAgente ? 'Pendiente' : 'Validado',
          validatedAt: isAgente ? null : new Date(),
        },
      });

      await auditAction(
        {
          actorId: session?.user?.id,
          action: isAgente ? 'create_pending' : 'create',
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
  const session = await getAppSession();
  const isManager = canManageClients(session);
  const isAgente = getRole(session) === 'AgenteCC';
  if (!isManager && !isAgente) {
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

  // Si se envía país, debe ser válido (normalizado a canónico).
  const normalizedCountry =
    parsed.data.country !== undefined ? normalizeCountry(parsed.data.country) : undefined;
  if (parsed.data.country !== undefined && !normalizedCountry) {
    return NextResponse.json({ error: 'País no válido.' }, { status: 400 });
  }

  // #9 El Agente CC solo puede editar SU propio cliente mientras siga "Pendiente";
  // no puede validar, desactivar ni cambiar el estado. Los validadores (Admin/
  // Recaudación/Cobranza) no tienen estas restricciones.
  if (!isManager && isAgente) {
    const owns = before.createdById === session?.user?.id;
    if (!owns || before.validationStatus !== 'Pendiente') {
      return NextResponse.json(
        { error: 'Solo puedes editar tus clientes mientras están pendientes de validación.' },
        { status: 403 }
      );
    }
    if (parsed.data.validationStatus !== undefined || parsed.data.isActive !== undefined) {
      return NextResponse.json(
        { error: 'No tienes permiso para validar o desactivar clientes.' },
        { status: 403 }
      );
    }
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
        ...(normalizedCountry ? { country: normalizedCountry } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        // #9 Validación: al marcar "Validado" se sella la fecha; volver a "Pendiente"
        // la limpia. (El Agente CC nunca llega acá: se bloquea arriba.)
        ...(parsed.data.validationStatus !== undefined
          ? {
              validationStatus: parsed.data.validationStatus,
              validatedAt: parsed.data.validationStatus === 'Validado' ? new Date() : null,
            }
          : {}),
      },
    });

    await auditAction(
      {
        actorId: session?.user?.id,
        action:
          parsed.data.validationStatus === 'Validado'
            ? 'validate'
            : parsed.data.isActive === false
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

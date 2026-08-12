import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { getAppSession } from '@/lib/auth';
import { normalizeCountry } from '@/lib/countries';
import prisma from '@/lib/prisma';

// Adquirientes (medios de pago). Obligatorios: nombre + RUT/Tax ID. BP SAP opcional
// (se incorpora luego). Sin código Navitaire. Gestión: Conciliación MP + Admin.

const adquirienteSchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().trim().min(1),
  sapBP: z.string().trim().optional(),
  country: z.string().trim().min(1).optional(),
  matchKeywords: z.string().optional(),
});

const updateAdquirienteSchema = adquirienteSchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});

const MANAGE_ROLES = ['Administrador', 'ConciliacionMediosDePago'];

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function canManage(session: Session | null) {
  const role = getRole(session);
  return !!role && MANAGE_ROLES.includes(role);
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function nextAdquirienteCode() {
  const rows = await prisma.adquiriente.findMany({
    where: { appCode: { startsWith: 'ADQ-' } },
    select: { appCode: true },
  });
  const nextNumber =
    rows.reduce((max, r) => {
      const value = Number(r.appCode.replace('ADQ-', ''));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;
  return `ADQ-${String(nextNumber).padStart(6, '0')}`;
}

export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const adquirientes = await prisma.adquiriente.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return NextResponse.json({ adquirientes });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!canManage(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = adquirienteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const country = parsed.data.country?.trim() ? normalizeCountry(parsed.data.country) : 'Chile';
  if (!country) {
    return NextResponse.json({ error: 'País no válido.' }, { status: 400 });
  }

  try {
    const appCode = await nextAdquirienteCode();
    const adquiriente = await prisma.$transaction(async (tx) => {
      const created = await tx.adquiriente.create({
        data: {
          appCode,
          name: parsed.data.name,
          taxId: parsed.data.taxId,
          sapBP: normalizeOptional(parsed.data.sapBP),
          country,
          matchKeywords: normalizeOptional(parsed.data.matchKeywords),
          createdById: session?.user?.id,
        },
      });
      await auditAction(
        {
          actorId: session?.user?.id,
          action: 'create',
          module: 'Cartola',
          entityType: 'Adquiriente',
          entityId: created.id,
          after: created,
          request,
        },
        tx
      );
      return created;
    });
    return NextResponse.json({ adquiriente }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear el adquiriente';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAppSession();
  if (!canManage(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = updateAdquirienteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const before = await prisma.adquiriente.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    return NextResponse.json({ error: 'Adquiriente no encontrado' }, { status: 404 });
  }

  const normalizedCountry =
    parsed.data.country !== undefined ? normalizeCountry(parsed.data.country) : undefined;
  if (parsed.data.country !== undefined && !normalizedCountry) {
    return NextResponse.json({ error: 'País no válido.' }, { status: 400 });
  }

  const adquiriente = await prisma.$transaction(async (tx) => {
    const updated = await tx.adquiriente.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.taxId !== undefined ? { taxId: parsed.data.taxId } : {}),
        ...(parsed.data.sapBP !== undefined ? { sapBP: normalizeOptional(parsed.data.sapBP) } : {}),
        ...(parsed.data.matchKeywords !== undefined
          ? { matchKeywords: normalizeOptional(parsed.data.matchKeywords) }
          : {}),
        ...(normalizedCountry ? { country: normalizedCountry } : {}),
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
        module: 'Cartola',
        entityType: 'Adquiriente',
        entityId: updated.id,
        before,
        after: updated,
        request,
      },
      tx
    );
    return updated;
  });

  return NextResponse.json({ adquiriente });
}

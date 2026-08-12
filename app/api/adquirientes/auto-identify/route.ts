import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';

import { auditAction } from '@/lib/audit';
import { getAppSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Auto-identificación de movimientos de Cartola como Adquiriente.
// Escanea los movimientos "Sin identificar" y, si en su descripción o adicionales
// aparece alguna palabra clave (parametrizable) de un adquiriente, lo identifica.
// Si un movimiento matchea con MÁS de un adquiriente, se omite (ambiguo) y se reporta.

const MANAGE_ROLES = ['Administrador', 'ConciliacionMediosDePago'];

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function canManage(session: Session | null) {
  const role = getRole(session);
  return !!role && MANAGE_ROLES.includes(role);
}

function parseKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

function extraFieldsToText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '')).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map((v) => String(v ?? '')).join(' ');
  return '';
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!canManage(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  // Adquirientes activos con palabras clave.
  const adquirientes = await prisma.adquiriente.findMany({
    where: { isActive: true, NOT: { matchKeywords: null } },
    select: { id: true, name: true, appCode: true, matchKeywords: true },
  });
  const rules = adquirientes
    .map((a) => ({ id: a.id, name: a.name, appCode: a.appCode, keywords: parseKeywords(a.matchKeywords) }))
    .filter((a) => a.keywords.length > 0);

  if (rules.length === 0) {
    return NextResponse.json({
      scanned: 0,
      identified: 0,
      ambiguous: [],
      message: 'No hay adquirientes con palabras clave configuradas.',
    });
  }

  // Movimientos aún sin identificar.
  const movements = await prisma.cartolaMovement.findMany({
    where: { identificationType: 'SinIdentificar' },
    select: { id: true, displayId: true, description: true, extraFields: true },
    take: 5000,
  });

  const ambiguous: { movementId: string; displayId: string | null; adquirientes: string[] }[] = [];
  const toIdentify: { movementId: string; adquirienteId: string }[] = [];

  for (const mov of movements) {
    const haystack = `${mov.description ?? ''} ${extraFieldsToText(mov.extraFields)}`.toLowerCase();
    const matches = rules.filter((rule) => rule.keywords.some((kw) => haystack.includes(kw)));
    if (matches.length === 1) {
      toIdentify.push({ movementId: mov.id, adquirienteId: matches[0].id });
    } else if (matches.length > 1) {
      ambiguous.push({
        movementId: mov.id,
        displayId: mov.displayId,
        adquirientes: matches.map((m) => `${m.appCode ?? ''} ${m.name}`.trim()),
      });
    }
  }

  // Aplica las identificaciones (una por una, con auditoría).
  let identified = 0;
  for (const item of toIdentify) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.cartolaMovement.update({
        where: { id: item.movementId },
        data: {
          identificationType: 'Adquiriente',
          adquirienteId: item.adquirienteId,
          salesChannel: null,
          status: 'FullyAllocated',
        },
      });
      await auditAction(
        {
          actorId: session?.user?.id,
          action: 'auto_identify_adquiriente',
          module: 'Cartola',
          entityType: 'CartolaMovement',
          entityId: updated.id,
          after: { adquirienteId: item.adquirienteId, identificationType: 'Adquiriente' },
          request,
        },
        tx
      );
    });
    identified += 1;
  }

  return NextResponse.json({
    scanned: movements.length,
    identified,
    ambiguous,
  });
}

import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { getAppSession } from '@/lib/auth';
import { normalizeCountry } from '@/lib/countries';
import prisma from '@/lib/prisma';

// Carga masiva de adquirientes (para inicializar). Valida fila a fila, deduplica
// por RUT/BP SAP (contra lo existente y dentro del archivo), numera ADQ- en un lote
// y reporta lo omitido sin abortar todo.

const rowSchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().trim().min(1),
  sapBP: z.string().trim().optional(),
  country: z.string().trim().optional(),
  matchKeywords: z.string().optional(),
});

const bulkSchema = z.object({ adquirientes: z.array(z.record(z.any())).min(1) });

const MANAGE_ROLES = ['Administrador', 'ConciliacionMediosDePago'];

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function canManage(session: Session | null) {
  const role = getRole(session);
  return !!role && MANAGE_ROLES.includes(role);
}

function norm(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!canManage(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Formato de carga inválido.' }, { status: 400 });
  }

  const existing = await prisma.adquiriente.findMany({
    select: { appCode: true, taxId: true, sapBP: true },
  });
  const existingTax = new Set(existing.map((a) => a.taxId.trim().toUpperCase()));
  const existingSap = new Set(
    existing.filter((a) => a.sapBP).map((a) => a.sapBP!.trim().toUpperCase())
  );
  let maxNum = existing.reduce((max, a) => {
    const value = Number(String(a.appCode).replace('ADQ-', ''));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  const skipped: { row: number; taxId?: string; reason: string }[] = [];
  const seenTax = new Set<string>();
  const seenSap = new Set<string>();
  const toCreate: {
    appCode: string;
    name: string;
    taxId: string;
    sapBP: string | null;
    country: string;
    matchKeywords: string | null;
    createdById: string | null;
  }[] = [];

  (parsed.data.adquirientes as Record<string, unknown>[]).forEach((raw, idx) => {
    const rowNum = idx + 2;
    const candidate = {
      name: String(raw.name ?? raw.Nombre ?? '').trim(),
      taxId: String(raw.taxId ?? raw.RUT ?? '').trim(),
      sapBP: String(raw.sapBP ?? raw.BP_SAP ?? (raw as Record<string, unknown>)['BP SAP'] ?? '').trim() || undefined,
      country: String(raw.country ?? raw.Pais ?? (raw as Record<string, unknown>)['País'] ?? '').trim() || undefined,
      matchKeywords:
        String(
          raw.matchKeywords ??
            raw.Palabras ??
            (raw as Record<string, unknown>)['Palabras clave'] ??
            raw.Keywords ??
            ''
        ).trim() || undefined,
    };

    const result = rowSchema.safeParse(candidate);
    if (!result.success) {
      skipped.push({ row: rowNum, taxId: candidate.taxId, reason: 'Falta nombre o RUT/Tax ID.' });
      return;
    }

    const taxKey = result.data.taxId.toUpperCase();
    if (existingTax.has(taxKey) || seenTax.has(taxKey)) {
      skipped.push({
        row: rowNum,
        taxId: result.data.taxId,
        reason: 'RUT/Tax ID duplicado (ya existe o repetido en el archivo).',
      });
      return;
    }

    const sapKey = result.data.sapBP?.toUpperCase();
    if (sapKey && (existingSap.has(sapKey) || seenSap.has(sapKey))) {
      skipped.push({ row: rowNum, taxId: result.data.taxId, reason: `BP SAP "${result.data.sapBP}" duplicado.` });
      return;
    }

    const country = result.data.country ? normalizeCountry(result.data.country) : 'Chile';
    if (result.data.country && !country) {
      skipped.push({
        row: rowNum,
        taxId: result.data.taxId,
        reason: `País "${result.data.country}" no es válido.`,
      });
      return;
    }

    seenTax.add(taxKey);
    if (sapKey) seenSap.add(sapKey);
    maxNum += 1;

    toCreate.push({
      appCode: `ADQ-${String(maxNum).padStart(6, '0')}`,
      name: result.data.name,
      taxId: result.data.taxId,
      sapBP: norm(result.data.sapBP),
      country: country || 'Chile',
      matchKeywords: norm(result.data.matchKeywords),
      createdById: session?.user?.id ?? null,
    });
  });

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.adquiriente.createMany({ data: toCreate });
      await auditAction(
        {
          actorId: session?.user?.id,
          action: 'bulk_create',
          module: 'Cartola',
          entityType: 'Adquiriente',
          entityId: 'bulk',
          after: { count: toCreate.length, appCodes: toCreate.map((a) => a.appCode) },
          request,
        },
        tx
      );
    });
  }

  const adquirientes = await prisma.adquiriente.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({ created: toCreate.length, skipped, adquirientes }, { status: 201 });
}

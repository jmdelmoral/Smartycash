import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { getAppSession } from '@/lib/auth';
import { normalizeCountry } from '@/lib/countries';
import prisma from '@/lib/prisma';

// Carga masiva de clientes (sobre todo para inicializar). Valida fila a fila,
// deduplica por RUT/Navitaire/BP SAP (contra lo existente y dentro del archivo),
// numera los CLI en un solo lote y reporta lo omitido sin abortar todo.

const rowSchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().trim().min(1),
  navitaireCode: z.string().trim().optional(),
  sapBP: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

const bulkSchema = z.object({ clients: z.array(z.record(z.any())).min(1) });

// Mismos roles que la creación individual: el Agente CC también puede cargar,
// pero sus clientes entran como "Pendiente".
const CLIENT_CREATE_ROLES = ['Administrador', 'AgenteCC', 'Recaudacion', 'Cobranza'];

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function canCreate(session: Session | null) {
  const role = getRole(session);
  return !!role && CLIENT_CREATE_ROLES.includes(role);
}

function norm(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!canCreate(session)) {
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

  const isAgente = getRole(session) === 'AgenteCC';

  // Estado actual: para dedup y para saber desde qué número seguir los CLI.
  const existing = await prisma.client.findMany({
    select: { appCode: true, taxId: true, navitaireCode: true, sapBP: true },
  });
  const existingTax = new Set(existing.map((c) => c.taxId.trim().toUpperCase()));
  const existingNav = new Set(
    existing.filter((c) => c.navitaireCode).map((c) => c.navitaireCode!.trim().toUpperCase())
  );
  const existingSap = new Set(
    existing.filter((c) => c.sapBP).map((c) => c.sapBP!.trim().toUpperCase())
  );
  let maxNum = existing.reduce((max, c) => {
    const value = Number(String(c.appCode).replace('CLI-', ''));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  const skipped: { row: number; taxId?: string; reason: string }[] = [];
  const seenTax = new Set<string>();
  const seenNav = new Set<string>();
  const seenSap = new Set<string>();
  const toCreate: {
    appCode: string;
    name: string;
    taxId: string;
    navitaireCode: string | null;
    sapBP: string | null;
    country: string;
    createdById: string | null;
    validationStatus: 'Pendiente' | 'Validado';
    validatedAt: Date | null;
  }[] = [];

  (parsed.data.clients as Record<string, unknown>[]).forEach((raw, idx) => {
    const rowNum = idx + 2; // +1 por el encabezado, +1 porque el usuario cuenta desde 1
    const candidate = {
      name: String(raw.name ?? raw.Nombre ?? '').trim(),
      taxId: String(raw.taxId ?? raw.RUT ?? '').trim(),
      navitaireCode: String(raw.navitaireCode ?? raw.Navitaire ?? '').trim() || undefined,
      sapBP: String(raw.sapBP ?? raw.BP_SAP ?? (raw as Record<string, unknown>)['BP SAP'] ?? '').trim() || undefined,
      country: String(raw.country ?? raw.Pais ?? (raw as Record<string, unknown>)['País'] ?? '').trim() || undefined,
    };

    const result = rowSchema.safeParse(candidate);
    if (!result.success) {
      skipped.push({ row: rowNum, taxId: candidate.taxId, reason: 'Falta nombre de agencia o RUT/Tax ID.' });
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

    const navKey = result.data.navitaireCode?.toUpperCase();
    if (navKey && (existingNav.has(navKey) || seenNav.has(navKey))) {
      skipped.push({ row: rowNum, taxId: result.data.taxId, reason: `Cod. Navitaire "${result.data.navitaireCode}" duplicado.` });
      return;
    }

    const sapKey = result.data.sapBP?.toUpperCase();
    if (sapKey && (existingSap.has(sapKey) || seenSap.has(sapKey))) {
      skipped.push({ row: rowNum, taxId: result.data.taxId, reason: `BP SAP "${result.data.sapBP}" duplicado.` });
      return;
    }

    // País: si viene vacío → Chile; si viene, debe ser válido (sin acentos/mayúsculas).
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
    if (navKey) seenNav.add(navKey);
    if (sapKey) seenSap.add(sapKey);
    maxNum += 1;

    toCreate.push({
      appCode: `CLI-${String(maxNum).padStart(6, '0')}`,
      name: result.data.name,
      taxId: result.data.taxId,
      navitaireCode: norm(result.data.navitaireCode),
      sapBP: norm(result.data.sapBP),
      country: country || 'Chile',
      createdById: session?.user?.id ?? null,
      validationStatus: isAgente ? 'Pendiente' : 'Validado',
      validatedAt: isAgente ? null : new Date(),
    });
  });

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.client.createMany({ data: toCreate });
      await auditAction(
        {
          actorId: session?.user?.id,
          action: 'bulk_create',
          module: 'Clientes',
          entityType: 'Client',
          entityId: 'bulk',
          after: {
            count: toCreate.length,
            appCodes: toCreate.map((c) => c.appCode),
            asPending: isAgente,
          },
          request,
        },
        tx
      );
    });
  }

  const clients = await prisma.client.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({ created: toCreate.length, skipped, clients }, { status: 201 });
}

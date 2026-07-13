import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1),
  accountNumber: z.string().trim().min(1),
  country: z.string().trim().min(1),
  currency: z.string().trim().min(3).max(3).default('CLP'),
  taxId: z.string().trim().optional(),
  legalName: z.string().trim().optional(),
});

const updateBankAccountSchema = bankAccountSchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function isAdmin(session: Session | null) {
  return getRole(session) === 'Administrador';
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function countryPrefix(country: string) {
  const normalized = country
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'cl' || normalized.includes('chile')) return 'CL';
  if (normalized === 'pe' || normalized.includes('per')) return 'PE';
  if (normalized === 'co' || normalized.includes('colombia')) return 'CO';

  return normalized.slice(0, 2).toUpperCase().padEnd(2, 'X');
}

async function nextBankAccountDisplayId(country: string) {
  const prefix = `${countryPrefix(country)}-CTA-`;
  const accounts = await prisma.bankAccount.findMany({
    where: { displayId: { startsWith: prefix } },
    select: { displayId: true },
  });

  const nextNumber =
    accounts.reduce((max, account) => {
      const value = Number(account.displayId.replace(prefix, ''));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;

  return `${prefix}${String(nextNumber).padStart(6, '0')}`;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const accounts = await prisma.bankAccount.findMany({
    orderBy: [{ isActive: 'desc' }, { bankName: 'asc' }, { accountNumber: 'asc' }],
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = bankAccountSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  try {
    const displayId = await nextBankAccountDisplayId(parsed.data.country);
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: {
          displayId,
          bankName: parsed.data.bankName.trim(),
          accountNumber: parsed.data.accountNumber.trim(),
          country: parsed.data.country.trim(),
          currency: parsed.data.currency.toUpperCase(),
          taxId: normalizeOptional(parsed.data.taxId),
          legalName: normalizeOptional(parsed.data.legalName),
          createdById: session?.user?.id,
        },
      });

      await auditAction(
        {
          actorId: session?.user?.id,
          action: 'create',
          module: 'Cartola',
          entityType: 'BankAccount',
          entityId: created.id,
          after: created,
          request,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la cuenta';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = updateBankAccountSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const before = await prisma.bankAccount.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
  }

  const shouldRefreshDisplayId =
    parsed.data.country !== undefined && parsed.data.country.trim() !== before.country;

  const displayId = shouldRefreshDisplayId
    ? await nextBankAccountDisplayId(parsed.data.country!)
    : undefined;

  const account = await prisma.$transaction(async (tx) => {
    const updated = await tx.bankAccount.update({
      where: { id: parsed.data.id },
      data: {
        ...(displayId !== undefined ? { displayId } : {}),
        ...(parsed.data.bankName !== undefined ? { bankName: parsed.data.bankName } : {}),
        ...(parsed.data.accountNumber !== undefined
          ? { accountNumber: parsed.data.accountNumber }
          : {}),
        ...(parsed.data.country !== undefined ? { country: parsed.data.country } : {}),
        ...(parsed.data.currency !== undefined
          ? { currency: parsed.data.currency.toUpperCase() }
          : {}),
        ...(parsed.data.taxId !== undefined ? { taxId: normalizeOptional(parsed.data.taxId) } : {}),
        ...(parsed.data.legalName !== undefined
          ? { legalName: normalizeOptional(parsed.data.legalName) }
          : {}),
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
        entityType: 'BankAccount',
        entityId: updated.id,
        before,
        after: updated,
        request,
      },
      tx
    );

    return updated;
  });

  return NextResponse.json({ account });
}

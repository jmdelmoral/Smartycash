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
});

const statusSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

function getRole(session: Session | null) {
  return session?.user?.role ?? session?.roles?.[0];
}

function isAdmin(session: Session | null) {
  return getRole(session) === 'Administrador';
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
    const account = await prisma.bankAccount.create({
      data: {
        ...parsed.data,
        bankName: parsed.data.bankName.trim(),
        accountNumber: parsed.data.accountNumber.trim(),
        country: parsed.data.country.trim(),
        currency: parsed.data.currency.toUpperCase(),
        createdById: session?.user?.id,
      },
    });

    await auditAction({
      actorId: session?.user?.id,
      action: 'create',
      module: 'Cartola',
      entityType: 'BankAccount',
      entityId: account.id,
      after: account,
      request,
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

  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const before = await prisma.bankAccount.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
  }

  const account = await prisma.bankAccount.update({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  });

  await auditAction({
    actorId: session?.user?.id,
    action: parsed.data.isActive ? 'activate' : 'deactivate',
    module: 'Cartola',
    entityType: 'BankAccount',
    entityId: account.id,
    before,
    after: account,
    request,
  });

  return NextResponse.json({ account });
}

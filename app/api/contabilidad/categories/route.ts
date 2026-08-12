import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions, getAppSession } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import prisma from '@/lib/prisma';

// Categorías del resumen (valores del enum de identificación).
const CATEGORIES = ['Adquiriente', 'GC', 'CobranzaCredito', 'AbonoDebito', 'SinIdentificar'];

/** Devuelve la cuenta contable por categoría (todas las categorías, con o sin valor). */
export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Contabilidad')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }
  const rows = await prisma.accountingCategory.findMany();
  const byCat = new Map(rows.map((r) => [r.category, r]));
  const categories = CATEGORIES.map((c) => ({
    category: c,
    accountCode: byCat.get(c)?.accountCode ?? '',
    accountName: byCat.get(c)?.accountName ?? '',
  }));
  return NextResponse.json({ categories });
}

const putSchema = z.object({
  categories: z.array(
    z.object({
      category: z.enum(['Adquiriente', 'GC', 'CobranzaCredito', 'AbonoDebito', 'SinIdentificar']),
      accountCode: z.string().trim().optional().default(''),
      accountName: z.string().trim().optional().default(''),
    })
  ),
});

/** Actualiza la cuenta contable por categoría. */
export async function PUT(request: Request) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Contabilidad')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }
  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const c of parsed.data.categories) {
      await tx.accountingCategory.upsert({
        where: { category: c.category },
        update: { accountCode: c.accountCode || null, accountName: c.accountName || null },
        create: {
          category: c.category,
          accountCode: c.accountCode || null,
          accountName: c.accountName || null,
        },
      });
    }
    await auditAction(
      {
        actorId: session.user.id,
        action: 'accounting_categories_updated',
        module: 'Contabilidad',
        entityType: 'AccountingCategory',
        entityId: 'mapping',
        after: parsed.data.categories,
        request,
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}

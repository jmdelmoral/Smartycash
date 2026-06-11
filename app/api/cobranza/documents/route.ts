import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import { cobranzaToUi, cobranzaTypeToPrisma, parseDateInput } from '@/lib/business-mappers';
import prisma from '@/lib/prisma';

const subDocumentSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  amount: z.coerce.number().positive(),
  detail: z.string().optional().default(''),
});

const paymentSchema = z.object({
  movementId: z.string().min(1),
  amount: z.coerce.number().positive(),
  date: z.string().min(1),
  bank: z.string().optional().default(''),
});

const documentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['Factura', 'Nota de cobro', 'Nota de Crédito']),
  date: z.string().min(1),
  country: z.string().min(1),
  clientId: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  pendingAmount: z.coerce.number().min(0),
  status: z.enum(['Pendiente', 'Pagado', 'Parcial']),
  subDocuments: z.array(subDocumentSchema),
  payments: z.array(paymentSchema),
});

const payloadSchema = z.object({
  documents: z.array(documentSchema),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const documents = await prisma.cobranzaDocument.findMany({
    where: { status: { not: 'Anulado' } },
    include: { items: true, payments: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ documents: documents.map(cobranzaToUi) });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  const documentIds = parsed.data.documents.map((document) => document.id);
  const auditEvents: Array<{
    action: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  }> = [];

  await prisma.$transaction(async (tx) => {
    const existingDocuments = await tx.cobranzaDocument.findMany({
      where: { id: { in: documentIds.length > 0 ? documentIds : [''] } },
      include: { payments: true, items: true },
    });
    const existingById = new Map(existingDocuments.map((document) => [document.id, document]));

    const documentsToAnnul = await tx.cobranzaDocument.findMany({
      where: {
        id: { notIn: documentIds.length > 0 ? documentIds : [''] },
        status: { not: 'Anulado' },
      },
      select: { id: true, status: true },
    });

    await tx.cobranzaDocument.updateMany({
      where: {
        id: { notIn: documentIds.length > 0 ? documentIds : [''] },
        status: { not: 'Anulado' },
      },
      data: { status: 'Anulado' },
    });

    for (const annulled of documentsToAnnul) {
      auditEvents.push({
        action: 'document_annulled',
        entityId: annulled.id,
        before: { status: annulled.status },
        after: { status: 'Anulado' },
      });
    }

    for (const document of parsed.data.documents) {
      const previous = existingById.get(document.id);
      await tx.cobranzaDocument.upsert({
        where: { id: document.id },
        update: {
          documentNumber: document.id,
          type: cobranzaTypeToPrisma(document.type),
          date: parseDateInput(document.date),
          country: document.country,
          clientId: document.clientId,
          totalAmount: document.totalAmount,
          pendingAmount: document.pendingAmount,
          status: document.status,
        },
        create: {
          id: document.id,
          documentNumber: document.id,
          type: cobranzaTypeToPrisma(document.type),
          date: parseDateInput(document.date),
          country: document.country,
          clientId: document.clientId,
          totalAmount: document.totalAmount,
          pendingAmount: document.pendingAmount,
          status: document.status,
          createdById: session.user.id,
        },
      });

      if (!previous) {
        auditEvents.push({
          action: 'document_created',
          entityId: document.id,
          after: {
            status: document.status,
            totalAmount: document.totalAmount,
            pendingAmount: document.pendingAmount,
          },
        });
      } else if (previous.status !== document.status) {
        auditEvents.push({
          action: 'document_status_changed',
          entityId: document.id,
          before: {
            status: previous.status,
            pendingAmount: previous.pendingAmount,
          },
          after: {
            status: document.status,
            pendingAmount: document.pendingAmount,
          },
        });
      }

      await tx.payment.deleteMany({ where: { documentId: document.id } });
      await tx.cobranzaDocumentItem.deleteMany({ where: { documentId: document.id } });

      for (const subDocument of document.subDocuments) {
        const saleReference = await tx.saleReference.upsert({
          where: { type_reference: { type: 'PNR', reference: subDocument.reference } },
          update: { clientId: document.clientId },
          create: { type: 'PNR', reference: subDocument.reference, clientId: document.clientId },
        });

        await tx.cobranzaDocumentItem.create({
          data: {
            id: subDocument.id,
            documentId: document.id,
            saleReferenceId: saleReference.id,
            reference: subDocument.reference,
            amount: subDocument.amount,
            detail: subDocument.detail,
          },
        });
      }

      for (const payment of document.payments) {
        const movement = await tx.cartolaMovement.findUnique({
          where: { id: payment.movementId },
        });
        const creditNote = movement
          ? null
          : await tx.cobranzaDocument.findUnique({ where: { id: payment.movementId } });

        await tx.payment.create({
          data: {
            documentId: document.id,
            sourceType: movement ? 'BankMovement' : creditNote ? 'CreditNote' : 'ManualAdjustment',
            movementId: movement?.id,
            creditNoteDocumentId: creditNote?.id,
            amount: payment.amount,
            date: parseDateInput(payment.date),
            bank: payment.bank,
            createdById: session.user.id,
          },
        });
      }

      const previousPaymentKeys =
        previous?.payments
          .map((payment) =>
            [
              payment.movementId ?? payment.creditNoteDocumentId ?? '',
              payment.amount.toString(),
              payment.date.toISOString().slice(0, 10),
            ].join(':')
          )
          .sort() ?? [];
      const nextPaymentKeys = document.payments
        .map((payment) =>
          [
            payment.movementId,
            payment.amount.toString(),
            parseDateInput(payment.date).toISOString().slice(0, 10),
          ].join(':')
        )
        .sort();

      if (JSON.stringify(previousPaymentKeys) !== JSON.stringify(nextPaymentKeys)) {
        auditEvents.push({
          action: 'document_payments_changed',
          entityId: document.id,
          before: { payments: previousPaymentKeys },
          after: { payments: nextPaymentKeys },
        });
      }
    }
  });

  for (const event of auditEvents) {
    await auditAction({
      actorId: session.user.id,
      action: event.action,
      module: 'Cobranza',
      entityType: 'CobranzaDocument',
      entityId: event.entityId,
      before: event.before,
      after: event.after,
      metadata: event.metadata,
      request,
    });
  }

  await auditAction({
    actorId: session.user.id,
    action: 'bulk_sync',
    module: 'Cobranza',
    entityType: 'CobranzaDocument',
    entityId: 'snapshot',
    metadata: { count: parsed.data.documents.length },
    request,
  });

  return NextResponse.json({ ok: true });
}

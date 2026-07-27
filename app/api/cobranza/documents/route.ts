import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
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
  // IDs the client had loaded (baseline). Used to scope annulments so we never
  // touch records created concurrently by other users. Optional for back-compat.
  knownIds: z.array(z.string()).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Cobranza')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
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
  if (!canWrite(session, 'Cobranza')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  if (parsed.data.documents.length === 0) {
    return NextResponse.json(
      { error: 'Sincronización vacía omitida para evitar borrado masivo' },
      { status: 400 }
    );
  }

  const documentIds = parsed.data.documents.map((document) => document.id);
  const payloadIdSet = new Set(documentIds);
  const reverseIdFilter = parsed.data.knownIds
    ? { in: parsed.data.knownIds.filter((id) => !payloadIdSet.has(id)) }
    : { notIn: documentIds.length > 0 ? documentIds : [''] };
  // #3 Correctitud financiera: el servidor NO confía en el saldo/estado que
  // envía el cliente. Valida cuadratura de PNR y sobrepago, y computa
  // pendingAmount y status a partir de los pagos (tolerancia de medio centavo).
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const EPS = 0.005;
  const derivedByDocId = new Map<
    string,
    { pendingAmount: number; status: 'Pendiente' | 'Parcial' | 'Pagado' }
  >();
  for (const document of parsed.data.documents) {
    const total = round2(document.totalAmount);
    if (document.subDocuments.length > 0) {
      // Detalle PNR OPCIONAL e incremental: solo rechazamos si la suma EXCEDE el
      // total del documento (sobre-detalle). Permitir carga parcial habilita
      // cargar PNRs de a poco / por lotes sin que el guardado falle.
      const itemsSum = round2(document.subDocuments.reduce((sum, item) => sum + item.amount, 0));
      if (itemsSum - total > EPS) {
        return NextResponse.json(
          {
            error: `Documento ${document.id}: la suma de PNR (${itemsSum}) excede el total (${total}).`,
          },
          { status: 400 }
        );
      }
    }
    const paymentsSum = round2(document.payments.reduce((sum, payment) => sum + payment.amount, 0));
    if (paymentsSum - total > EPS) {
      return NextResponse.json(
        {
          error: `Documento ${document.id}: los pagos (${paymentsSum}) superan el total (${total}).`,
        },
        { status: 400 }
      );
    }
    const pendingAmount = Math.max(round2(total - paymentsSum), 0);
    const status: 'Pendiente' | 'Parcial' | 'Pagado' =
      pendingAmount <= EPS ? 'Pagado' : pendingAmount >= total - EPS ? 'Pendiente' : 'Parcial';
    derivedByDocId.set(document.id, { pendingAmount, status });
  }

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
        id: reverseIdFilter,
        status: { not: 'Anulado' },
      },
      select: { id: true, status: true },
    });

    await tx.cobranzaDocument.updateMany({
      where: {
        id: reverseIdFilter,
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
      const derived = derivedByDocId.get(document.id)!;
      await tx.cobranzaDocument.upsert({
        where: { id: document.id },
        update: {
          documentNumber: document.id,
          type: cobranzaTypeToPrisma(document.type),
          date: parseDateInput(document.date),
          country: document.country,
          clientId: document.clientId,
          totalAmount: document.totalAmount,
          pendingAmount: derived.pendingAmount,
          status: derived.status,
        },
        create: {
          id: document.id,
          documentNumber: document.id,
          type: cobranzaTypeToPrisma(document.type),
          date: parseDateInput(document.date),
          country: document.country,
          clientId: document.clientId,
          totalAmount: document.totalAmount,
          pendingAmount: derived.pendingAmount,
          status: derived.status,
          createdById: session.user.id,
        },
      });

      if (!previous) {
        auditEvents.push({
          action: 'document_created',
          entityId: document.id,
          after: {
            status: derived.status,
            totalAmount: document.totalAmount,
            pendingAmount: derived.pendingAmount,
          },
        });
      } else if (previous.status !== derived.status) {
        auditEvents.push({
          action: 'document_status_changed',
          entityId: document.id,
          before: {
            status: previous.status,
            pendingAmount: previous.pendingAmount,
          },
          after: {
            status: derived.status,
            pendingAmount: derived.pendingAmount,
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
    for (const event of auditEvents) {
      await auditAction(
        {
          actorId: session.user.id,
          action: event.action,
          module: 'Cobranza',
          entityType: 'CobranzaDocument',
          entityId: event.entityId,
          before: event.before,
          after: event.after,
          metadata: event.metadata,
          request,
        },
        tx
      );
    }

    await auditAction(
      {
        actorId: session.user.id,
        action: 'bulk_sync',
        module: 'Cobranza',
        entityType: 'CobranzaDocument',
        entityId: 'snapshot',
        metadata: { count: parsed.data.documents.length },
        request,
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}

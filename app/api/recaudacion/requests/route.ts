import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import { canApproveRecaudacion, canRead, canWrite, RECAUDACION_APPROVAL_STATUSES } from '@/lib/authz';
import { collectionToUi, parseDateInput } from '@/lib/business-mappers';
import prisma from '@/lib/prisma';

const documentSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  amount: z.coerce.number().positive(),
  detail: z.string().optional().default(''),
});

const requestSchema = z.object({
  id: z.string().min(1),
  bankAccountId: z.string().min(1),
  transferDate: z.string().min(1),
  amount: z.coerce.number().positive(),
  clientId: z.string().min(1),
  supportFileName: z.string().optional().default(''),
  status: z.enum(['Pendiente', 'Preaprobado', 'Aprobado', 'Rechazado', 'InformacionSolicitada']),
  rejectionComment: z.string().optional(),
  authorizationCode: z.string().trim().optional(),
  infoRequestComment: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  associatedMovementId: z.string().optional(),
  documents: z.array(documentSchema),
});

const payloadSchema = z.object({
  requests: z.array(requestSchema),
  // IDs the client had loaded (baseline). Used to scope annulments so we never
  // touch records created concurrently by other users. Optional for back-compat.
  knownIds: z.array(z.string()).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Recaudacion')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const requests = await prisma.collectionRequest.findMany({
    where: { status: { not: 'Anulado' } },
    include: { supportFile: true, items: true, attachments: true },
    orderBy: [{ createdAt: 'desc' }],
  });

  return NextResponse.json({ requests: requests.map(collectionToUi) });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Recaudacion')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }

  // Action-level rule: only Recaudacion/Admin may APPROVE or REJECT a request.
  // "Preaprobado" is not restricted (it is the normal result of AgenteCC's
  // submit button). We only block *new* approval transitions so re-sending
  // unchanged rows in a bulk sync is still allowed.
  if (!canApproveRecaudacion(session)) {
    const incomingIds = parsed.data.requests.map((item) => item.id);
    const existing = await prisma.collectionRequest.findMany({
      where: { id: { in: incomingIds.length > 0 ? incomingIds : [''] } },
      select: { id: true, status: true },
    });
    const previousStatusById = new Map(existing.map((item) => [item.id, item.status]));
    const attemptsApproval = parsed.data.requests.some(
      (item) =>
        RECAUDACION_APPROVAL_STATUSES.includes(item.status) &&
        previousStatusById.get(item.id) !== item.status
    );
    if (attemptsApproval) {
      return NextResponse.json(
        { error: 'Solo Recaudación puede aprobar, rechazar o solicitar información' },
        { status: 403 }
      );
    }
  }

  if (parsed.data.requests.length === 0) {
    return NextResponse.json(
      { error: 'Sincronización vacía omitida para evitar borrado masivo' },
      { status: 400 }
    );
  }

  const requestIds = parsed.data.requests.map((item) => item.id);
  const payloadIdSet = new Set(requestIds);
  const reverseIdFilter = parsed.data.knownIds
    ? { in: parsed.data.knownIds.filter((id) => !payloadIdSet.has(id)) }
    : { notIn: requestIds.length > 0 ? requestIds : [''] };
  // #3 Cuadratura: la suma de PNR debe igualar el monto de la solicitud.
  const round2Rec = (n: number) => Math.round(n * 100) / 100;
  const EPS_REC = 0.005;
  for (const item of parsed.data.requests) {
    if (item.documents.length > 0) {
      const docsSum = round2Rec(item.documents.reduce((sum, doc) => sum + doc.amount, 0));
      if (Math.abs(docsSum - round2Rec(item.amount)) > EPS_REC) {
        return NextResponse.json(
          {
            error: `Solicitud ${item.id}: la suma de PNR (${docsSum}) no cuadra con el monto (${round2Rec(item.amount)}).`,
          },
          { status: 400 }
        );
      }
    }
  }

  // Feature: codigo de autorizacion unico. Un caso es duplicado si coincide en
  // (codigo, cuenta, monto, cliente) con otra solicitud activa. Validacion
  // autoritativa en el servidor (el front no siempre tiene el historico cargado).
  const withCode = parsed.data.requests.filter((r) => (r.authorizationCode ?? '').trim() !== '');
  if (withCode.length > 0) {
    const seen = new Map<string, string>();
    for (const r of withCode) {
      const key = [
        r.authorizationCode!.trim().toUpperCase(),
        r.bankAccountId,
        r.clientId,
        round2Rec(r.amount),
      ].join('|');
      const prevId = seen.get(key);
      if (prevId && prevId !== r.id) {
        return NextResponse.json(
          {
            error: `Codigo de autorizacion duplicado en la carga: ${r.authorizationCode} (misma cuenta, monto y cliente).`,
          },
          { status: 400 }
        );
      }
      seen.set(key, r.id);
    }
    const incomingIds = parsed.data.requests.map((r) => r.id);
    const existingDup = await prisma.collectionRequest.findFirst({
      where: {
        status: { not: 'Anulado' },
        id: { notIn: incomingIds },
        OR: withCode.map((r) => ({
          authorizationCode: r.authorizationCode!.trim(),
          bankAccountId: r.bankAccountId,
          clientId: r.clientId,
          amount: round2Rec(r.amount),
        })),
      },
      select: { authorizationCode: true },
    });
    if (existingDup) {
      return NextResponse.json(
        {
          error: `Ya existe una solicitud activa con el codigo de autorizacion ${existingDup.authorizationCode} para la misma cuenta, monto y cliente.`,
        },
        { status: 400 }
      );
    }
  }

  const auditEvents: Array<{
    action: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  }> = [];

  await prisma.$transaction(async (tx) => {
    const existingRequests = await tx.collectionRequest.findMany({
      where: { id: { in: requestIds.length > 0 ? requestIds : [''] } },
      select: {
        id: true,
        status: true,
        associatedMovementId: true,
        rejectionComment: true,
        amount: true,
      },
    });
    const existingById = new Map(existingRequests.map((item) => [item.id, item]));

    const requestsToAnnul = await tx.collectionRequest.findMany({
      where: {
        id: reverseIdFilter,
        status: { not: 'Anulado' },
      },
      select: { id: true, status: true },
    });

    await tx.collectionRequest.updateMany({
      where: {
        id: reverseIdFilter,
        status: { not: 'Anulado' },
      },
      data: { status: 'Anulado' },
    });

    for (const annulled of requestsToAnnul) {
      auditEvents.push({
        action: 'request_annulled',
        entityId: annulled.id,
        before: { status: annulled.status },
        after: { status: 'Anulado' },
      });
    }

    for (const item of parsed.data.requests) {
      const previous = existingById.get(item.id);
      const associatedMovement = item.associatedMovementId
        ? await tx.cartolaMovement.findUnique({ where: { id: item.associatedMovementId } })
        : null;
      const associatedMovementId = associatedMovement?.id ?? null;
      const infoRequestedAt =
        item.status === 'InformacionSolicitada' && previous?.status !== 'InformacionSolicitada'
          ? new Date()
          : undefined;

      const supportFile = item.supportFileName
        ? await tx.supportFile.create({
            data: {
              fileName: item.supportFileName,
              uploadedById: session.user.id,
            },
          })
        : null;

      await tx.collectionRequest.upsert({
        where: { id: item.id },
        update: {
          requestNumber: item.id,
          bankAccountId: item.bankAccountId,
          transferDate: parseDateInput(item.transferDate),
          amount: item.amount,
          clientId: item.clientId,
          supportFileId: supportFile?.id,
          status: item.status,
          associatedMovementId: associatedMovement?.id,
          rejectionComment: item.rejectionComment,
          authorizationCode: item.authorizationCode ?? null,
          infoRequestComment: item.infoRequestComment ?? null,
          infoRequestedAt,
          reviewedById:
            item.status === 'Aprobado' || item.status === 'Rechazado' ? session.user.id : undefined,
          reviewedAt:
            item.status === 'Aprobado' || item.status === 'Rechazado' ? new Date() : undefined,
        },
        create: {
          id: item.id,
          requestNumber: item.id,
          bankAccountId: item.bankAccountId,
          transferDate: parseDateInput(item.transferDate),
          amount: item.amount,
          clientId: item.clientId,
          supportFileId: supportFile?.id,
          status: item.status,
          associatedMovementId: associatedMovement?.id,
          rejectionComment: item.rejectionComment,
          authorizationCode: item.authorizationCode ?? null,
          infoRequestComment: item.infoRequestComment ?? null,
          infoRequestedAt,
          createdById: session.user.id,
          reviewedById:
            item.status === 'Aprobado' || item.status === 'Rechazado' ? session.user.id : undefined,
          reviewedAt:
            item.status === 'Aprobado' || item.status === 'Rechazado' ? new Date() : undefined,
        },
      });

      // Vincula los comprobantes subidos (attachments) a esta solicitud.
      if (item.attachmentIds && item.attachmentIds.length > 0) {
        await tx.supportFile.updateMany({
          where: { id: { in: item.attachmentIds } },
          data: { collectionRequestId: item.id },
        });
      }

      if (!previous) {
        auditEvents.push({
          action: 'request_created',
          entityId: item.id,
          after: {
            status: item.status,
            amount: item.amount,
            associatedMovementId,
          },
        });
      } else if (previous.status !== item.status) {
        auditEvents.push({
          action: 'request_status_changed',
          entityId: item.id,
          before: {
            status: previous.status,
            rejectionComment: previous.rejectionComment,
          },
          after: {
            status: item.status,
            rejectionComment: item.rejectionComment,
          },
        });
      }

      if (previous && previous.associatedMovementId !== associatedMovementId) {
        auditEvents.push({
          action: 'request_movement_link_changed',
          entityId: item.id,
          before: { associatedMovementId: previous.associatedMovementId },
          after: { associatedMovementId },
        });
      }

      await tx.collectionRequestItem.deleteMany({
        where: { collectionRequestId: item.id },
      });

      for (const document of item.documents) {
        const saleReference = await tx.saleReference.upsert({
          where: { type_reference: { type: 'PNR', reference: document.reference } },
          update: { clientId: item.clientId },
          create: { type: 'PNR', reference: document.reference, clientId: item.clientId },
        });

        await tx.collectionRequestItem.create({
          data: {
            id: document.id,
            collectionRequestId: item.id,
            saleReferenceId: saleReference.id,
            reference: document.reference,
            amount: document.amount,
            detail: document.detail,
          },
        });
      }
    }
    for (const event of auditEvents) {
      await auditAction(
        {
          actorId: session.user.id,
          action: event.action,
          module: 'Recaudacion',
          entityType: 'CollectionRequest',
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
        module: 'Recaudacion',
        entityType: 'CollectionRequest',
        entityId: 'snapshot',
        metadata: { count: parsed.data.requests.length },
        request,
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}

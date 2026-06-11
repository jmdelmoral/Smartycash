import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
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
  status: z.enum(['Pendiente', 'Preaprobado', 'Aprobado', 'Rechazado']),
  rejectionComment: z.string().optional(),
  associatedMovementId: z.string().optional(),
  documents: z.array(documentSchema),
});

const payloadSchema = z.object({
  requests: z.array(requestSchema),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const requests = await prisma.collectionRequest.findMany({
    where: { status: { not: 'Anulado' } },
    include: { supportFile: true, items: true },
    orderBy: [{ createdAt: 'desc' }],
  });

  return NextResponse.json({ requests: requests.map(collectionToUi) });
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

  const requestIds = parsed.data.requests.map((item) => item.id);
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
        id: { notIn: requestIds.length > 0 ? requestIds : [''] },
        status: { not: 'Anulado' },
      },
      select: { id: true, status: true },
    });

    await tx.collectionRequest.updateMany({
      where: {
        id: { notIn: requestIds.length > 0 ? requestIds : [''] },
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
          createdById: session.user.id,
          reviewedById:
            item.status === 'Aprobado' || item.status === 'Rechazado' ? session.user.id : undefined,
          reviewedAt:
            item.status === 'Aprobado' || item.status === 'Rechazado' ? new Date() : undefined,
        },
      });

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
  });

  for (const event of auditEvents) {
    await auditAction({
      actorId: session.user.id,
      action: event.action,
      module: 'Recaudacion',
      entityType: 'CollectionRequest',
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
    module: 'Recaudacion',
    entityType: 'CollectionRequest',
    entityId: 'snapshot',
    metadata: { count: parsed.data.requests.length },
    request,
  });

  return NextResponse.json({ ok: true });
}

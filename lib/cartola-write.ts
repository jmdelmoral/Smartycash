/**
 * Per-record write helper for Cartola movements.
 *
 * `applyMovement` upserts a single movement plus its document allocations and
 * appends audit events — WITHOUT the destructive "reverse everything not sent"
 * behaviour of the old bulk PUT. Used by the POST (create/edit) endpoint.
 */
import { Prisma } from '@/lib/generated/prisma';
import { nextMovementDisplayId, type DisplayIdAllocator } from '@/lib/cartola-display';
import {
  moduleFromIdentification,
  movementStatusFromDocuments,
  parseDateInput,
  uiIdentificationToPrisma,
} from '@/lib/business-mappers';

export type MovementDocumentInput = {
  id: string;
  reference: string;
  amount: number;
  detail: string;
};

export type MovementInput = {
  movementId: string;
  amount: number;
  bank: string;
  bankAccount: string;
  country: string;
  description: string;
  date: string;
  extraFields: [string, string, string, string, string];
  mainIdentification: 'Sin identificar' | 'Adquiriente' | 'GC' | 'Cobranza crédito' | 'Abono débito';
  mainIdentificationId?: string;
  documents: MovementDocumentInput[];
};

export type AuditEvent = {
  action: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

/**
 * Validación de cuadratura (servidor): un movimiento identificado (tipo distinto
 * de "Sin identificar") debe tener al menos un documento y que la suma de sus
 * documentos iguale el monto del movimiento (tolerancia de $0.01). Devuelve un
 * mensaje de error o null si está OK.
 */
export function movementBalanceError(movement: {
  movementId: string;
  amount: number;
  mainIdentification: string;
  documents: { amount: number }[];
}): string | null {
  if (movement.mainIdentification === 'Sin identificar') return null;
  if (movement.documents.length === 0) {
    return `Movimiento ${movement.movementId}: un movimiento identificado (${movement.mainIdentification}) requiere al menos un documento.`;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sum = round2(movement.documents.reduce((acc, d) => acc + d.amount, 0));
  if (Math.abs(sum - round2(movement.amount)) > 0.01) {
    return `Movimiento ${movement.movementId}: la suma de documentos (${sum}) no cuadra con el monto (${round2(movement.amount)}).`;
  }
  return null;
}

export async function applyMovement(
  tx: Prisma.TransactionClient,
  movement: MovementInput,
  userId: string | undefined,
  auditEvents: AuditEvent[],
  allocate?: DisplayIdAllocator
): Promise<void> {
  const previous = await tx.cartolaMovement.findUnique({
    where: { id: movement.movementId },
    include: { allocations: true },
  });

  const nextStatus = movementStatusFromDocuments(movement);
  const nextIdentificationType = uiIdentificationToPrisma(movement.mainIdentification);
  const bankAccount = await tx.bankAccount.findFirst({
    where: {
      accountNumber: movement.bankAccount,
      bankName: movement.bank,
      country: movement.country,
    },
  });

  // Código visible: se asigna a nuevos o a existentes sin código (backfill perezoso).
  const displayId = previous?.displayId
    ? undefined
    : allocate
      ? await allocate(movement)
      : await nextMovementDisplayId(tx, movement);

  await tx.cartolaMovement.upsert({
    where: { id: movement.movementId },
    update: {
      displayId,
      bankAccountId: bankAccount?.id,
      bank: movement.bank,
      bankAccountNumber: movement.bankAccount,
      country: movement.country,
      amount: movement.amount,
      date: parseDateInput(movement.date),
      description: movement.description,
      extraFields: movement.extraFields,
      identificationType: nextIdentificationType,
      status: nextStatus,
      ownerUserId: userId,
    },
    create: {
      id: movement.movementId,
      displayId,
      bankAccountId: bankAccount?.id,
      bank: movement.bank,
      bankAccountNumber: movement.bankAccount,
      country: movement.country,
      amount: movement.amount,
      date: parseDateInput(movement.date),
      description: movement.description,
      extraFields: movement.extraFields,
      identificationType: nextIdentificationType,
      status: nextStatus,
      ownerUserId: userId,
    },
  });

  if (!previous) {
    auditEvents.push({
      action: 'movement_created',
      entityId: movement.movementId,
      after: {
        status: nextStatus,
        amount: movement.amount,
        identificationType: nextIdentificationType,
      },
    });
  } else {
    if (previous.status !== nextStatus) {
      auditEvents.push({
        action: 'movement_status_changed',
        entityId: movement.movementId,
        before: { status: previous.status },
        after: { status: nextStatus },
      });
    }
    if (previous.identificationType !== nextIdentificationType) {
      auditEvents.push({
        action: 'movement_identification_changed',
        entityId: movement.movementId,
        before: { identificationType: previous.identificationType },
        after: { identificationType: nextIdentificationType },
      });
    }
  }

  await tx.cartolaMovementAllocation.deleteMany({
    where: { movementId: movement.movementId },
  });

  for (const document of movement.documents) {
    const saleReference = await tx.saleReference.upsert({
      where: { type_reference: { type: 'PNR', reference: document.reference } },
      update: {},
      create: { type: 'PNR', reference: document.reference },
    });

    await tx.cartolaMovementAllocation.create({
      data: {
        movementId: movement.movementId,
        module: moduleFromIdentification(movement.mainIdentification),
        sourceEntityType: 'CartolaDocument',
        sourceEntityId: document.id,
        saleReferenceId: saleReference.id,
        amount: document.amount,
        detail: document.detail,
        createdById: userId,
      },
    });
  }

  const previousAllocationKeys =
    previous?.allocations
      .map((allocation) => `${allocation.sourceEntityId}:${allocation.amount.toString()}`)
      .sort() ?? [];
  const nextAllocationKeys = movement.documents
    .map((document) => `${document.id}:${document.amount.toString()}`)
    .sort();

  if (JSON.stringify(previousAllocationKeys) !== JSON.stringify(nextAllocationKeys)) {
    auditEvents.push({
      action: 'movement_allocations_changed',
      entityId: movement.movementId,
      before: { allocations: previousAllocationKeys },
      after: { allocations: nextAllocationKeys },
    });
  }
}

import type {
  CartolaMovement as PrismaCartolaMovement,
  CartolaMovementAllocation,
  CobranzaDocument as PrismaCobranzaDocument,
  CobranzaDocumentItem,
  CollectionRequest as PrismaCollectionRequest,
  CollectionRequestItem,
  Payment,
} from '@/lib/generated/prisma';
import type {
  CartolaDocument,
  CartolaMovement,
  CobranzaDocumentType,
  CobranzaMainDocument,
  CobranzaStatus,
  CollectionRequest,
  CollectionStatus,
  MainIdentificationType,
} from '@/types';

type CartolaWithAllocations = PrismaCartolaMovement & {
  allocations: (CartolaMovementAllocation & {
    saleReference: { reference: string } | null;
  })[];
};

type CollectionWithItems = PrismaCollectionRequest & {
  supportFile: { fileName: string } | null;
  items: CollectionRequestItem[];
  attachments?: { id: string; fileName: string; mimeType: string | null }[];
};

type CobranzaWithItemsAndPayments = PrismaCobranzaDocument & {
  items: CobranzaDocumentItem[];
  payments: Payment[];
};

export function parseDateInput(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const parts = value.split(/[/|-]/);
  if (parts.length === 3 && parts[2]?.length === 4) {
    return new Date(
      `${parts[2]}-${parts[1]?.padStart(2, '0')}-${parts[0]?.padStart(2, '0')}T00:00:00.000Z`
    );
  }
  return new Date(value);
}

export function toDateInput(value: Date): string {
  return value.toISOString().split('T')[0] ?? '';
}

export function uiIdentificationToPrisma(value: MainIdentificationType | string) {
  if (value === 'Adquiriente') return 'Adquiriente';
  if (value === 'GC') return 'GC';
  if (value === 'Cobranza crédito') return 'CobranzaCredito';
  if (value === 'Abono débito') return 'AbonoDebito';
  return 'SinIdentificar';
}

export function prismaIdentificationToUi(value: string): MainIdentificationType {
  if (value === 'Adquiriente') return 'Adquiriente';
  if (value === 'GC') return 'GC';
  if (value === 'CobranzaCredito') return 'Cobranza crédito';
  if (value === 'AbonoDebito') return 'Abono débito';
  return 'Sin identificar';
}

export function movementStatusFromDocuments(
  movement: Pick<CartolaMovement, 'amount' | 'documents'> & { mainIdentification: string }
) {
  const used = movement.documents.reduce((sum, document) => sum + document.amount, 0);
  if (movement.mainIdentification === 'Sin identificar' || used <= 0) return 'Unidentified';
  if (used + 0.01 < movement.amount) return 'PartiallyAllocated';
  return 'FullyAllocated';
}

export function moduleFromIdentification(value: MainIdentificationType | string) {
  if (value === 'GC') return 'Recaudacion';
  if (value === 'Cobranza crédito') return 'Cobranza';
  return 'Cartola';
}

export function cartolaToUi(movement: CartolaWithAllocations): CartolaMovement {
  const documents: CartolaDocument[] = movement.allocations
    .filter((allocation) => !allocation.voidedAt)
    .map((allocation) => ({
      id: allocation.sourceEntityId,
      reference: allocation.saleReference?.reference ?? allocation.sourceEntityId,
      amount: Number(allocation.amount),
      detail: allocation.detail ?? '',
    }));

  return {
    movementId: movement.id,
    displayId: movement.displayId ?? undefined,
    ownerUserId: movement.ownerUserId ?? 'N/A',
    amount: Number(movement.amount),
    bank: movement.bank,
    bankAccount: movement.bankAccountNumber,
    country: movement.country,
    description: movement.description,
    date: toDateInput(movement.date),
    extraFields: normalizeExtraFields(movement.extraFields),
    mainIdentification: prismaIdentificationToUi(movement.identificationType),
    mainIdentificationId: movement.allocations[0]?.sourceEntityId ?? '',
    documents,
  };
}

export function collectionToUi(request: CollectionWithItems): CollectionRequest {
  return {
    id: request.id,
    bankAccountId: request.bankAccountId,
    transferDate: toDateInput(request.transferDate),
    amount: Number(request.amount),
    clientId: request.clientId,
    supportFileName: request.supportFile?.fileName ?? '',
    authorizationCode: request.authorizationCode ?? undefined,
    status: request.status as CollectionStatus,
    rejectionComment: request.rejectionComment ?? undefined,
    associatedMovementId: request.associatedMovementId ?? undefined,
    infoRequestComment: request.infoRequestComment ?? undefined,
    infoRequestedAt: request.infoRequestedAt ? request.infoRequestedAt.toISOString() : undefined,
    // Marcas de tiempo por etapa (informe de tiempos del Agente CC).
    createdAt: request.createdAt ? request.createdAt.toISOString() : undefined,
    preapprovedAt: request.preapprovedAt ? request.preapprovedAt.toISOString() : undefined,
    approvedAt: request.approvedAt ? request.approvedAt.toISOString() : undefined,
    gestionadoCcAt: request.gestionadoCcAt ? request.gestionadoCcAt.toISOString() : undefined,
    reversedAt: request.reversedAt ? request.reversedAt.toISOString() : undefined,
    attachments:
      request.attachments?.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType ?? undefined,
      })) ?? [],
    documents: request.items.map((item) => ({
      id: item.id,
      reference: item.reference,
      amount: Number(item.amount),
      detail: item.detail ?? '',
    })),
  };
}

export function cobranzaTypeToPrisma(value: CobranzaDocumentType | string) {
  if (value === 'Nota de Crédito') return 'NotaDeCredito';
  if (value === 'Nota de cobro') return 'NotaDeCobro';
  return 'Factura';
}

export function prismaCobranzaTypeToUi(value: string): CobranzaDocumentType {
  if (value === 'NotaDeCredito') return 'Nota de Crédito';
  if (value === 'NotaDeCobro') return 'Nota de cobro';
  return 'Factura';
}

export function cobranzaToUi(document: CobranzaWithItemsAndPayments): CobranzaMainDocument {
  return {
    id: document.id,
    type: prismaCobranzaTypeToUi(document.type),
    date: toDateInput(document.date),
    country: document.country,
    clientId: document.clientId,
    totalAmount: Number(document.totalAmount),
    pendingAmount: Number(document.pendingAmount),
    status: document.status as CobranzaStatus,
    subDocuments: document.items.map((item) => ({
      id: item.id,
      reference: item.reference,
      amount: Number(item.amount),
      detail: item.detail ?? '',
    })),
    payments: document.payments
      .filter((payment) => !payment.voidedAt)
      .map((payment) => ({
        movementId: payment.movementId ?? payment.creditNoteDocumentId ?? payment.id,
        amount: Number(payment.amount),
        date: toDateInput(payment.date),
        bank: payment.bank ?? '',
      })),
  };
}

function normalizeExtraFields(value: unknown): [string, string, string, string, string] {
  if (Array.isArray(value)) {
    const fields = value.map((item) => String(item ?? '')).slice(0, 5);
    while (fields.length < 5) fields.push('');
    return fields as [string, string, string, string, string];
  }
  return ['', '', '', '', ''];
}

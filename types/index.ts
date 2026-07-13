/**
 * Definiciones globales de tipos para SmartyCash
 */

export type UserRole =
  | 'Administrador'
  | 'Contabilidad'
  | 'Recaudacion'
  | 'ConciliacionMediosDePago'
  | 'AgenteCC'
  | 'Cobranza';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  Administrador: 'Administrador',
  Contabilidad: 'Contabilidad',
  Recaudacion: 'Recaudación',
  ConciliacionMediosDePago: 'Conciliación medios de pago',
  AgenteCC: 'Agente CC',
  Cobranza: 'Cobranza',
};

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type BankAccount = {
  id: string;
  displayId?: string;
  bankName: string;
  accountNumber: string;
  country: string;
  currency?: string;
  taxId?: string | null;
  legalName?: string | null;
  isActive?: boolean;
};

export type Client = {
  id: string;
  appCode?: string;
  name: string;
  taxId: string; // RUT/DNI
  navitaireCode?: string | null;
  sapBP?: string | null;
  isActive?: boolean;
};

export type CollectionStatus =
  | 'Pendiente'
  | 'Preaprobado'
  | 'Aprobado'
  | 'Rechazado'
  | 'InformacionSolicitada';

export type RequestAttachment = {
  id: string;
  fileName: string;
  mimeType?: string;
};

export type CollectionRequest = {
  id: string;
  bankAccountId: string;
  transferDate: string;
  amount: number;
  clientId: string;
  supportFileName: string;
  authorizationCode?: string; // codigo de autorizacion del comprobante bancario
  attachments?: RequestAttachment[]; // comprobantes subidos (multiples)
  attachmentIds?: string[]; // ids recien subidos, para vincular al guardar
  infoRequestComment?: string; // comentario de Recaudacion al solicitar SWIFT/MT103
  infoRequestedAt?: string; // ISO: cuando se solicito informacion
  status: CollectionStatus;
  rejectionComment?: string;
  associatedMovementId?: string;
  documents: CartolaDocument[]; // Detalle de PNRs
};

export type MainIdentificationType =
  | 'Sin identificar'
  | 'Adquiriente'
  | 'GC'
  | 'Cobranza crédito'
  | 'Abono débito';

export type CartolaDocument = {
  id: string;
  reference: string;
  amount: number;
  detail: string;
};

export type CartolaMovement = {
  movementId: string;
  displayId?: string; // codigo visible legible
  ownerUserId: string;
  amount: number;
  bank: string;
  bankAccount: string;
  country: string;
  description: string;
  date: string;
  extraFields: [string, string, string, string, string];
  mainIdentification: MainIdentificationType;
  mainIdentificationId: string;
  documents: CartolaDocument[];
};

export type CobranzaDocumentType = 'Factura' | 'Nota de cobro' | 'Nota de Crédito';
export type CobranzaStatus = 'Pendiente' | 'Pagado' | 'Parcial';

export type CobranzaMainDocument = {
  id: string; // ID del documento (Factura/Nota)
  type: CobranzaDocumentType;
  date: string; // Fecha emisión
  country: string;
  clientId: string;
  totalAmount: number;
  pendingAmount: number;
  status: CobranzaStatus;
  subDocuments: CartolaDocument[]; // Detalle de PNRs o cargos
  payments: { movementId: string; amount: number; date: string; bank: string }[]; // Historial de pagos
};

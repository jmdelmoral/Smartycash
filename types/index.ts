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
  /** Decimales que usa la cuenta (0 = CLP/Chile, 2 = USD/centavos, etc.). */
  decimalPlaces?: number;
  taxId?: string | null;
  legalName?: string | null;
  isActive?: boolean;
};

export type SalesChannel = 'GDS' | 'VentaAeropuerto' | 'VentaWeb';

/** Adquiriente (medios de pago). Similar a Cliente pero sin código Navitaire. */
export type Adquiriente = {
  id: string;
  appCode?: string;
  name: string;
  taxId: string; // RUT/Tax ID (obligatorio)
  sapBP?: string | null; // BP SAP (opcional; se incorpora luego)
  country?: string;
  // Palabras clave (coma/línea) para auto-identificar movimientos en Cartola.
  matchKeywords?: string | null;
  isActive?: boolean;
  createdById?: string | null;
};

export type ClientValidationStatus = 'Pendiente' | 'Validado';

export type Client = {
  id: string;
  appCode?: string;
  name: string;
  taxId: string; // RUT/DNI
  navitaireCode?: string | null;
  sapBP?: string | null;
  country?: string; // país del cliente (define el país de sus documentos)
  isActive?: boolean;
  // #9 Validación: 'Pendiente' cuando lo crea un Agente CC; 'Validado' tras aprobación
  // de Recaudación/Cobranza (o si lo creó un rol validador / preexistía).
  validationStatus?: ClientValidationStatus;
  validatedAt?: string | null;
  createdById?: string | null; // para saber si el Agente CC es dueño del cliente
};

export type CollectionStatus =
  | 'Pendiente'
  | 'Preaprobado'
  | 'Aprobado'
  | 'Rechazado'
  | 'InformacionSolicitada'
  | 'GestionadoCC'
  | 'Anulado';

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
  quotationId?: string; // #11 ID de cotizacion asociado (opcional)
  attachments?: RequestAttachment[]; // comprobantes subidos (multiples)
  attachmentIds?: string[]; // ids recien subidos, para vincular al guardar
  infoRequestComment?: string; // comentario de Recaudacion al solicitar SWIFT/MT103
  infoRequestedAt?: string; // ISO: cuando se solicito informacion
  // Marcas de tiempo por etapa (informe de tiempos del Agente CC). ISO.
  createdAt?: string;
  preapprovedAt?: string;
  approvedAt?: string;
  gestionadoCcAt?: string;
  reversedAt?: string;
  reviewedAt?: string; // ISO: aprobación/rechazo por Recaudación
  updatedAt?: string; // ISO: última modificación/acción sobre la solicitud
  createdByName?: string; // agente CC que ingresó la solicitud
  status: CollectionStatus;
  // Track de FINANZAS (Recaudación), independiente del status (track CC).
  financeApproved?: boolean;
  financeApprovedAt?: string | null;
  rejectionComment?: string;
  associatedMovementId?: string;
  associatedMovementDisplayId?: string; // D 2c: vinculo Cartola denormalizado
  associatedMovementBank?: string; // D 2c
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
  // Identificación como Adquiriente (Conciliación medios de pago): adquiriente + canal.
  adquirienteId?: string | null;
  salesChannel?: SalesChannel | null;
  // Estado de cierre contable (para el gate de reversas/anulaciones/ediciones).
  closeState?: 'Abierto' | 'CerradoParcial' | 'CerradoDefinitivo';
};

export type CobranzaDocumentType = 'Factura' | 'Nota de cobro' | 'Nota de Crédito';
export type CobranzaStatus = 'Pendiente' | 'Pagado' | 'Parcial';

export type CobranzaMainDocument = {
  id: string; // Identidad interna compuesta: `${country}::${typeCode}::${documentNumber}`
  documentNumber: string; // Número visible del documento (Factura/Nota)
  type: CobranzaDocumentType; // categoría (derivada del código)
  typeCode: string; // código fiscal/interno (33, 34, 61, ...)
  date: string; // Fecha emisión
  country: string;
  clientId: string;
  totalAmount: number;
  pendingAmount: number;
  status: CobranzaStatus;
  subDocuments: CartolaDocument[]; // Detalle de PNRs o cargos
  payments: { movementId: string; amount: number; date: string; bank: string }[]; // Historial de pagos
};

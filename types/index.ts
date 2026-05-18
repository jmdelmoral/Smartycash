/**
 * Definiciones globales de tipos para SmartyCash
 */

export type UserRole =
  | 'Administrador'
  | 'Contabilidad'
  | 'Recaudación'
  | 'Conciliación medios de pago'
  | 'Agente CC'
  | 'Cobranza';

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type BankAccount = {
  id: string;
  bankName: string;
  accountNumber: string;
  country: string;
};

export type Client = {
  id: string;
  name: string;
  taxId: string; // RUT/DNI
  navitaireCode?: string;
  sapBP?: string;
};

export type CollectionStatus = 'Pendiente' | 'Preaprobado' | 'Aprobado' | 'Rechazado';

export type CollectionRequest = {
  id: string;
  bankAccountId: string;
  transferDate: string;
  amount: number;
  clientId: string;
  supportFileName: string;
  status: CollectionStatus;
  rejectionComment?: string;
  associatedMovementId?: string;
  documents: CartolaDocument[]; // Detalle de PNRs
};

export type MainIdentificationType = 
  | 'Sin identificar' 
  | 'Adquiriente' 
  | 'GC' 
  | 'Cobranza crédito';

export type CartolaDocument = {
  id: string;
  reference: string;
  amount: number;
  detail: string;
};

export type CartolaMovement = {
  movementId: string;
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

export type CobranzaDocumentType = 'Factura' | 'Nota de cobro';
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

Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.6.0
 * Query Engine version: f676762280b54cd07c770017ed3711ddde35f37a
 */
Prisma.prismaVersion = {
  client: "6.6.0",
  engine: "f676762280b54cd07c770017ed3711ddde35f37a"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  name: 'name',
  role: 'role',
  mustChangePassword: 'mustChangePassword',
  passwordHash: 'passwordHash',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  provider: 'provider',
  providerAccountId: 'providerAccountId',
  refresh_token: 'refresh_token',
  access_token: 'access_token',
  expires_at: 'expires_at',
  token_type: 'token_type',
  scope: 'scope',
  id_token: 'id_token',
  session_state: 'session_state'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  sessionToken: 'sessionToken',
  userId: 'userId',
  expires: 'expires'
};

exports.Prisma.VerificationTokenScalarFieldEnum = {
  identifier: 'identifier',
  token: 'token',
  expires: 'expires'
};

exports.Prisma.BankAccountScalarFieldEnum = {
  id: 'id',
  bankName: 'bankName',
  accountNumber: 'accountNumber',
  country: 'country',
  currency: 'currency',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdById: 'createdById'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  name: 'name',
  taxId: 'taxId',
  navitaireCode: 'navitaireCode',
  sapBP: 'sapBP',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdById: 'createdById'
};

exports.Prisma.SaleReferenceScalarFieldEnum = {
  id: 'id',
  reference: 'reference',
  type: 'type',
  sourceSystem: 'sourceSystem',
  clientId: 'clientId',
  saleDate: 'saleDate',
  currency: 'currency',
  totalAmount: 'totalAmount',
  status: 'status',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BankStatementImportScalarFieldEnum = {
  id: 'id',
  fileName: 'fileName',
  rowCount: 'rowCount',
  totalAmount: 'totalAmount',
  status: 'status',
  uploadedById: 'uploadedById',
  createdAt: 'createdAt'
};

exports.Prisma.CartolaMovementScalarFieldEnum = {
  id: 'id',
  importId: 'importId',
  externalReference: 'externalReference',
  bankAccountId: 'bankAccountId',
  bank: 'bank',
  bankAccountNumber: 'bankAccountNumber',
  country: 'country',
  amount: 'amount',
  date: 'date',
  description: 'description',
  extraFields: 'extraFields',
  identificationType: 'identificationType',
  status: 'status',
  ownerUserId: 'ownerUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CartolaMovementAllocationScalarFieldEnum = {
  id: 'id',
  movementId: 'movementId',
  module: 'module',
  sourceEntityType: 'sourceEntityType',
  sourceEntityId: 'sourceEntityId',
  saleReferenceId: 'saleReferenceId',
  amount: 'amount',
  detail: 'detail',
  createdById: 'createdById',
  createdAt: 'createdAt',
  voidedAt: 'voidedAt',
  voidedReason: 'voidedReason',
  collectionRequestId: 'collectionRequestId',
  cobranzaDocumentId: 'cobranzaDocumentId'
};

exports.Prisma.CollectionRequestScalarFieldEnum = {
  id: 'id',
  requestNumber: 'requestNumber',
  bankAccountId: 'bankAccountId',
  transferDate: 'transferDate',
  amount: 'amount',
  clientId: 'clientId',
  supportFileId: 'supportFileId',
  status: 'status',
  associatedMovementId: 'associatedMovementId',
  rejectionComment: 'rejectionComment',
  createdById: 'createdById',
  reviewedById: 'reviewedById',
  reviewedAt: 'reviewedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CollectionRequestItemScalarFieldEnum = {
  id: 'id',
  collectionRequestId: 'collectionRequestId',
  saleReferenceId: 'saleReferenceId',
  reference: 'reference',
  amount: 'amount',
  detail: 'detail'
};

exports.Prisma.SupportFileScalarFieldEnum = {
  id: 'id',
  fileName: 'fileName',
  mimeType: 'mimeType',
  sizeBytes: 'sizeBytes',
  storageKey: 'storageKey',
  checksum: 'checksum',
  uploadedById: 'uploadedById',
  createdAt: 'createdAt'
};

exports.Prisma.CobranzaDocumentScalarFieldEnum = {
  id: 'id',
  documentNumber: 'documentNumber',
  type: 'type',
  date: 'date',
  country: 'country',
  currency: 'currency',
  clientId: 'clientId',
  totalAmount: 'totalAmount',
  pendingAmount: 'pendingAmount',
  status: 'status',
  sourceSystem: 'sourceSystem',
  metadata: 'metadata',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CobranzaDocumentItemScalarFieldEnum = {
  id: 'id',
  documentId: 'documentId',
  saleReferenceId: 'saleReferenceId',
  reference: 'reference',
  amount: 'amount',
  detail: 'detail'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  documentId: 'documentId',
  sourceType: 'sourceType',
  movementId: 'movementId',
  allocationId: 'allocationId',
  creditNoteDocumentId: 'creditNoteDocumentId',
  amount: 'amount',
  date: 'date',
  bank: 'bank',
  createdById: 'createdById',
  createdAt: 'createdAt',
  voidedAt: 'voidedAt',
  voidedReason: 'voidedReason'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  actorId: 'actorId',
  action: 'action',
  module: 'module',
  entityType: 'entityType',
  entityId: 'entityId',
  before: 'before',
  after: 'after',
  metadata: 'metadata',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.UserOrderByRelevanceFieldEnum = {
  id: 'id',
  email: 'email',
  name: 'name',
  passwordHash: 'passwordHash'
};

exports.Prisma.AccountOrderByRelevanceFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  provider: 'provider',
  providerAccountId: 'providerAccountId',
  refresh_token: 'refresh_token',
  access_token: 'access_token',
  token_type: 'token_type',
  scope: 'scope',
  id_token: 'id_token',
  session_state: 'session_state'
};

exports.Prisma.SessionOrderByRelevanceFieldEnum = {
  id: 'id',
  sessionToken: 'sessionToken',
  userId: 'userId'
};

exports.Prisma.VerificationTokenOrderByRelevanceFieldEnum = {
  identifier: 'identifier',
  token: 'token'
};

exports.Prisma.BankAccountOrderByRelevanceFieldEnum = {
  id: 'id',
  bankName: 'bankName',
  accountNumber: 'accountNumber',
  country: 'country',
  currency: 'currency',
  createdById: 'createdById'
};

exports.Prisma.ClientOrderByRelevanceFieldEnum = {
  id: 'id',
  name: 'name',
  taxId: 'taxId',
  navitaireCode: 'navitaireCode',
  sapBP: 'sapBP',
  createdById: 'createdById'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.SaleReferenceOrderByRelevanceFieldEnum = {
  id: 'id',
  reference: 'reference',
  sourceSystem: 'sourceSystem',
  clientId: 'clientId',
  currency: 'currency',
  status: 'status'
};

exports.Prisma.BankStatementImportOrderByRelevanceFieldEnum = {
  id: 'id',
  fileName: 'fileName',
  uploadedById: 'uploadedById'
};

exports.Prisma.CartolaMovementOrderByRelevanceFieldEnum = {
  id: 'id',
  importId: 'importId',
  externalReference: 'externalReference',
  bankAccountId: 'bankAccountId',
  bank: 'bank',
  bankAccountNumber: 'bankAccountNumber',
  country: 'country',
  description: 'description',
  ownerUserId: 'ownerUserId'
};

exports.Prisma.CartolaMovementAllocationOrderByRelevanceFieldEnum = {
  id: 'id',
  movementId: 'movementId',
  sourceEntityType: 'sourceEntityType',
  sourceEntityId: 'sourceEntityId',
  saleReferenceId: 'saleReferenceId',
  detail: 'detail',
  createdById: 'createdById',
  voidedReason: 'voidedReason',
  collectionRequestId: 'collectionRequestId',
  cobranzaDocumentId: 'cobranzaDocumentId'
};

exports.Prisma.CollectionRequestOrderByRelevanceFieldEnum = {
  id: 'id',
  requestNumber: 'requestNumber',
  bankAccountId: 'bankAccountId',
  clientId: 'clientId',
  supportFileId: 'supportFileId',
  associatedMovementId: 'associatedMovementId',
  rejectionComment: 'rejectionComment',
  createdById: 'createdById',
  reviewedById: 'reviewedById'
};

exports.Prisma.CollectionRequestItemOrderByRelevanceFieldEnum = {
  id: 'id',
  collectionRequestId: 'collectionRequestId',
  saleReferenceId: 'saleReferenceId',
  reference: 'reference',
  detail: 'detail'
};

exports.Prisma.SupportFileOrderByRelevanceFieldEnum = {
  id: 'id',
  fileName: 'fileName',
  mimeType: 'mimeType',
  storageKey: 'storageKey',
  checksum: 'checksum',
  uploadedById: 'uploadedById'
};

exports.Prisma.CobranzaDocumentOrderByRelevanceFieldEnum = {
  id: 'id',
  documentNumber: 'documentNumber',
  country: 'country',
  currency: 'currency',
  clientId: 'clientId',
  sourceSystem: 'sourceSystem',
  createdById: 'createdById'
};

exports.Prisma.CobranzaDocumentItemOrderByRelevanceFieldEnum = {
  id: 'id',
  documentId: 'documentId',
  saleReferenceId: 'saleReferenceId',
  reference: 'reference',
  detail: 'detail'
};

exports.Prisma.PaymentOrderByRelevanceFieldEnum = {
  id: 'id',
  documentId: 'documentId',
  movementId: 'movementId',
  allocationId: 'allocationId',
  creditNoteDocumentId: 'creditNoteDocumentId',
  bank: 'bank',
  createdById: 'createdById',
  voidedReason: 'voidedReason'
};

exports.Prisma.AuditLogOrderByRelevanceFieldEnum = {
  id: 'id',
  actorId: 'actorId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent'
};
exports.UserRole = exports.$Enums.UserRole = {
  Administrador: 'Administrador',
  Contabilidad: 'Contabilidad',
  Recaudacion: 'Recaudacion',
  ConciliacionMediosDePago: 'ConciliacionMediosDePago',
  AgenteCC: 'AgenteCC',
  Cobranza: 'Cobranza'
};

exports.SaleReferenceType = exports.$Enums.SaleReferenceType = {
  PNR: 'PNR',
  Ticket: 'Ticket',
  Order: 'Order',
  InvoiceLine: 'InvoiceLine',
  Other: 'Other'
};

exports.ImportStatus = exports.$Enums.ImportStatus = {
  Processed: 'Processed',
  Failed: 'Failed',
  Reversed: 'Reversed'
};

exports.MainIdentificationType = exports.$Enums.MainIdentificationType = {
  SinIdentificar: 'SinIdentificar',
  Adquiriente: 'Adquiriente',
  GC: 'GC',
  CobranzaCredito: 'CobranzaCredito'
};

exports.MovementStatus = exports.$Enums.MovementStatus = {
  Unidentified: 'Unidentified',
  PartiallyAllocated: 'PartiallyAllocated',
  FullyAllocated: 'FullyAllocated',
  Reversed: 'Reversed'
};

exports.TraceModule = exports.$Enums.TraceModule = {
  Cartola: 'Cartola',
  Recaudacion: 'Recaudacion',
  Cobranza: 'Cobranza',
  Contabilidad: 'Contabilidad',
  Clientes: 'Clientes',
  Usuarios: 'Usuarios',
  Sistema: 'Sistema'
};

exports.CollectionStatus = exports.$Enums.CollectionStatus = {
  Pendiente: 'Pendiente',
  Preaprobado: 'Preaprobado',
  Aprobado: 'Aprobado',
  Rechazado: 'Rechazado',
  Anulado: 'Anulado'
};

exports.CobranzaDocumentType = exports.$Enums.CobranzaDocumentType = {
  Factura: 'Factura',
  NotaDeCobro: 'NotaDeCobro',
  NotaDeCredito: 'NotaDeCredito'
};

exports.CobranzaDocumentStatus = exports.$Enums.CobranzaDocumentStatus = {
  Pendiente: 'Pendiente',
  Pagado: 'Pagado',
  Parcial: 'Parcial',
  Anulado: 'Anulado'
};

exports.PaymentSourceType = exports.$Enums.PaymentSourceType = {
  BankMovement: 'BankMovement',
  CreditNote: 'CreditNote',
  ManualAdjustment: 'ManualAdjustment'
};

exports.Prisma.ModelName = {
  User: 'User',
  Account: 'Account',
  Session: 'Session',
  VerificationToken: 'VerificationToken',
  BankAccount: 'BankAccount',
  Client: 'Client',
  SaleReference: 'SaleReference',
  BankStatementImport: 'BankStatementImport',
  CartolaMovement: 'CartolaMovement',
  CartolaMovementAllocation: 'CartolaMovementAllocation',
  CollectionRequest: 'CollectionRequest',
  CollectionRequestItem: 'CollectionRequestItem',
  SupportFile: 'SupportFile',
  CobranzaDocument: 'CobranzaDocument',
  CobranzaDocumentItem: 'CobranzaDocumentItem',
  Payment: 'Payment',
  AuditLog: 'AuditLog'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }

        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)

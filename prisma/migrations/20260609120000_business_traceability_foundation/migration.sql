-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `role` ENUM('Administrador', 'Contabilidad', 'Recaudacion', 'Conciliacion medios de pago', 'Agente CC', 'Cobranza') NOT NULL DEFAULT 'Agente CC',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `passwordHash` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_token_key`(`token`),
    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,

    INDEX `BankAccount_accountNumber_idx`(`accountNumber`),
    UNIQUE INDEX `BankAccount_bankName_accountNumber_country_key`(`bankName`, `accountNumber`, `country`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `taxId` VARCHAR(191) NOT NULL,
    `navitaireCode` VARCHAR(191) NULL,
    `sapBP` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,

    UNIQUE INDEX `Client_taxId_key`(`taxId`),
    UNIQUE INDEX `Client_navitaireCode_key`(`navitaireCode`),
    UNIQUE INDEX `Client_sapBP_key`(`sapBP`),
    INDEX `Client_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleReference` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `type` ENUM('PNR', 'Ticket', 'Order', 'InvoiceLine', 'Other') NOT NULL DEFAULT 'PNR',
    `sourceSystem` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `saleDate` DATETIME(3) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `totalAmount` DECIMAL(18, 2) NULL,
    `status` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SaleReference_reference_idx`(`reference`),
    INDEX `SaleReference_clientId_idx`(`clientId`),
    UNIQUE INDEX `SaleReference_type_reference_key`(`type`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankStatementImport` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `rowCount` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('Processed', 'Failed', 'Reversed') NOT NULL DEFAULT 'Processed',
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CartolaMovement` (
    `id` VARCHAR(191) NOT NULL,
    `importId` VARCHAR(191) NULL,
    `externalReference` VARCHAR(191) NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `bank` VARCHAR(191) NOT NULL,
    `bankAccountNumber` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `extraFields` JSON NULL,
    `identificationType` ENUM('SinIdentificar', 'Adquiriente', 'GC', 'CobranzaCredito') NOT NULL DEFAULT 'SinIdentificar',
    `status` ENUM('Unidentified', 'PartiallyAllocated', 'FullyAllocated', 'Reversed') NOT NULL DEFAULT 'Unidentified',
    `ownerUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CartolaMovement_bankAccountId_date_idx`(`bankAccountId`, `date`),
    INDEX `CartolaMovement_bankAccountNumber_idx`(`bankAccountNumber`),
    INDEX `CartolaMovement_status_idx`(`status`),
    INDEX `CartolaMovement_identificationType_idx`(`identificationType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CartolaMovementAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `movementId` VARCHAR(191) NOT NULL,
    `module` ENUM('Cartola', 'Recaudacion', 'Cobranza', 'Contabilidad', 'Clientes', 'Usuarios', 'Sistema') NOT NULL,
    `sourceEntityType` VARCHAR(191) NOT NULL,
    `sourceEntityId` VARCHAR(191) NOT NULL,
    `saleReferenceId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `detail` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidedAt` DATETIME(3) NULL,
    `voidedReason` VARCHAR(191) NULL,
    `collectionRequestId` VARCHAR(191) NULL,
    `cobranzaDocumentId` VARCHAR(191) NULL,

    INDEX `CartolaMovementAllocation_movementId_idx`(`movementId`),
    INDEX `CartolaMovementAllocation_sourceEntityType_sourceEntityId_idx`(`sourceEntityType`, `sourceEntityId`),
    INDEX `CartolaMovementAllocation_saleReferenceId_idx`(`saleReferenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `requestNumber` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `transferDate` DATETIME(3) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `supportFileId` VARCHAR(191) NULL,
    `status` ENUM('Pendiente', 'Preaprobado', 'Aprobado', 'Rechazado', 'Anulado') NOT NULL DEFAULT 'Pendiente',
    `associatedMovementId` VARCHAR(191) NULL,
    `rejectionComment` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CollectionRequest_requestNumber_key`(`requestNumber`),
    INDEX `CollectionRequest_clientId_idx`(`clientId`),
    INDEX `CollectionRequest_status_idx`(`status`),
    INDEX `CollectionRequest_associatedMovementId_idx`(`associatedMovementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectionRequestItem` (
    `id` VARCHAR(191) NOT NULL,
    `collectionRequestId` VARCHAR(191) NOT NULL,
    `saleReferenceId` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `detail` VARCHAR(191) NULL,

    INDEX `CollectionRequestItem_reference_idx`(`reference`),
    INDEX `CollectionRequestItem_saleReferenceId_idx`(`saleReferenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportFile` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `storageKey` VARCHAR(191) NULL,
    `checksum` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CobranzaDocument` (
    `id` VARCHAR(191) NOT NULL,
    `documentNumber` VARCHAR(191) NOT NULL,
    `type` ENUM('Factura', 'NotaDeCobro', 'NotaDeCredito') NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `clientId` VARCHAR(191) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `pendingAmount` DECIMAL(18, 2) NOT NULL,
    `status` ENUM('Pendiente', 'Pagado', 'Parcial', 'Anulado') NOT NULL DEFAULT 'Pendiente',
    `sourceSystem` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CobranzaDocument_clientId_idx`(`clientId`),
    INDEX `CobranzaDocument_status_idx`(`status`),
    UNIQUE INDEX `CobranzaDocument_documentNumber_type_key`(`documentNumber`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CobranzaDocumentItem` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `saleReferenceId` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `detail` VARCHAR(191) NULL,

    INDEX `CobranzaDocumentItem_reference_idx`(`reference`),
    INDEX `CobranzaDocumentItem_saleReferenceId_idx`(`saleReferenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('BankMovement', 'CreditNote', 'ManualAdjustment') NOT NULL,
    `movementId` VARCHAR(191) NULL,
    `allocationId` VARCHAR(191) NULL,
    `creditNoteDocumentId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `bank` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidedAt` DATETIME(3) NULL,
    `voidedReason` VARCHAR(191) NULL,

    INDEX `Payment_documentId_idx`(`documentId`),
    INDEX `Payment_movementId_idx`(`movementId`),
    INDEX `Payment_allocationId_idx`(`allocationId`),
    INDEX `Payment_creditNoteDocumentId_idx`(`creditNoteDocumentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `module` ENUM('Cartola', 'Recaudacion', 'Cobranza', 'Contabilidad', 'Clientes', 'Usuarios', 'Sistema') NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_actorId_idx`(`actorId`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_module_idx`(`module`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleReference` ADD CONSTRAINT `SaleReference_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementImport` ADD CONSTRAINT `BankStatementImport_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovement` ADD CONSTRAINT `CartolaMovement_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `BankStatementImport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovement` ADD CONSTRAINT `CartolaMovement_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovement` ADD CONSTRAINT `CartolaMovement_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovementAllocation` ADD CONSTRAINT `CartolaMovementAllocation_movementId_fkey` FOREIGN KEY (`movementId`) REFERENCES `CartolaMovement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovementAllocation` ADD CONSTRAINT `CartolaMovementAllocation_saleReferenceId_fkey` FOREIGN KEY (`saleReferenceId`) REFERENCES `SaleReference`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovementAllocation` ADD CONSTRAINT `CartolaMovementAllocation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovementAllocation` ADD CONSTRAINT `CartolaMovementAllocation_collectionRequestId_fkey` FOREIGN KEY (`collectionRequestId`) REFERENCES `CollectionRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartolaMovementAllocation` ADD CONSTRAINT `CartolaMovementAllocation_cobranzaDocumentId_fkey` FOREIGN KEY (`cobranzaDocumentId`) REFERENCES `CobranzaDocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequest` ADD CONSTRAINT `CollectionRequest_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequest` ADD CONSTRAINT `CollectionRequest_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequest` ADD CONSTRAINT `CollectionRequest_supportFileId_fkey` FOREIGN KEY (`supportFileId`) REFERENCES `SupportFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequest` ADD CONSTRAINT `CollectionRequest_associatedMovementId_fkey` FOREIGN KEY (`associatedMovementId`) REFERENCES `CartolaMovement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequest` ADD CONSTRAINT `CollectionRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequest` ADD CONSTRAINT `CollectionRequest_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequestItem` ADD CONSTRAINT `CollectionRequestItem_collectionRequestId_fkey` FOREIGN KEY (`collectionRequestId`) REFERENCES `CollectionRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionRequestItem` ADD CONSTRAINT `CollectionRequestItem_saleReferenceId_fkey` FOREIGN KEY (`saleReferenceId`) REFERENCES `SaleReference`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportFile` ADD CONSTRAINT `SupportFile_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CobranzaDocument` ADD CONSTRAINT `CobranzaDocument_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CobranzaDocument` ADD CONSTRAINT `CobranzaDocument_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CobranzaDocumentItem` ADD CONSTRAINT `CobranzaDocumentItem_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `CobranzaDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CobranzaDocumentItem` ADD CONSTRAINT `CobranzaDocumentItem_saleReferenceId_fkey` FOREIGN KEY (`saleReferenceId`) REFERENCES `SaleReference`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `CobranzaDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_movementId_fkey` FOREIGN KEY (`movementId`) REFERENCES `CartolaMovement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_allocationId_fkey` FOREIGN KEY (`allocationId`) REFERENCES `CartolaMovementAllocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_creditNoteDocumentId_fkey` FOREIGN KEY (`creditNoteDocumentId`) REFERENCES `CobranzaDocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


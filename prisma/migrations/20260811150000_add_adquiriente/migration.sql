-- Adquirientes (medios de pago). Similar a Cliente pero SIN código Navitaire;
-- el BP SAP es OPCIONAL (se incorpora luego). Incluye el enganche en movimientos:
-- adquirienteId + canal de venta (GDS / Venta aeropuerto / Venta web).
CREATE TABLE `Adquiriente` (
    `id` VARCHAR(191) NOT NULL,
    `appCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `taxId` VARCHAR(191) NOT NULL,
    `sapBP` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'Chile',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,

    UNIQUE INDEX `Adquiriente_appCode_key`(`appCode`),
    UNIQUE INDEX `Adquiriente_taxId_key`(`taxId`),
    UNIQUE INDEX `Adquiriente_sapBP_key`(`sapBP`),
    INDEX `Adquiriente_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CartolaMovement`
    ADD COLUMN `adquirienteId` VARCHAR(191) NULL,
    ADD COLUMN `salesChannel` ENUM('GDS', 'VentaAeropuerto', 'VentaWeb') NULL;

CREATE INDEX `CartolaMovement_adquirienteId_idx` ON `CartolaMovement`(`adquirienteId`);

ALTER TABLE `Adquiriente` ADD CONSTRAINT `Adquiriente_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CartolaMovement` ADD CONSTRAINT `CartolaMovement_adquirienteId_fkey` FOREIGN KEY (`adquirienteId`) REFERENCES `Adquiriente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

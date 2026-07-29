-- Modulo Contabilidad (Fase B): cierres por rango + detalle por movimiento.

CREATE TABLE `Closure` (
  `id` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NULL,
  `dateFrom` DATETIME(3) NOT NULL,
  `dateTo` DATETIME(3) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `totalCount` INT NULL,
  `identifiedCount` INT NULL,
  `pendingCount` INT NULL,
  `totalAmount` DECIMAL(18, 2) NULL,
  `identifiedAmount` DECIMAL(18, 2) NULL,
  `pendingAmount` DECIMAL(18, 2) NULL,
  PRIMARY KEY (`id`),
  INDEX `Closure_dateFrom_dateTo_idx`(`dateFrom`, `dateTo`)
);

CREATE TABLE `ClosureItem` (
  `id` VARCHAR(191) NOT NULL,
  `closureId` VARCHAR(191) NOT NULL,
  `movementId` VARCHAR(191) NOT NULL,
  `closeState` ENUM('Abierto', 'CerradoParcial', 'CerradoDefinitivo') NOT NULL,
  `identificationType` ENUM('Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito') NOT NULL,
  `amount` DECIMAL(18, 2) NOT NULL,
  `originYear` INT NOT NULL,
  `originMonth` INT NOT NULL,
  `carriedFromClosureId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ClosureItem_closureId_movementId_key`(`closureId`, `movementId`),
  INDEX `ClosureItem_closureId_idx`(`closureId`),
  INDEX `ClosureItem_movementId_idx`(`movementId`)
);

ALTER TABLE `CartolaMovement`
  ADD COLUMN `finalizedInClosureId` VARCHAR(191) NULL;

CREATE INDEX `CartolaMovement_finalizedInClosureId_idx` ON `CartolaMovement`(`finalizedInClosureId`);

ALTER TABLE `Closure`
  ADD CONSTRAINT `Closure_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ClosureItem`
  ADD CONSTRAINT `ClosureItem_closureId_fkey`
  FOREIGN KEY (`closureId`) REFERENCES `Closure`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClosureItem`
  ADD CONSTRAINT `ClosureItem_movementId_fkey`
  FOREIGN KEY (`movementId`) REFERENCES `CartolaMovement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CartolaMovement`
  ADD CONSTRAINT `CartolaMovement_finalizedInClosureId_fkey`
  FOREIGN KEY (`finalizedInClosureId`) REFERENCES `Closure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

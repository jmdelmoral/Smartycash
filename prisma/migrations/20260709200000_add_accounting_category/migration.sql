-- Cuenta contable por categoría (config global editable en Contabilidad).
CREATE TABLE `AccountingCategory` (
  `category` VARCHAR(191) NOT NULL,
  `accountCode` VARCHAR(191) NULL,
  `accountName` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`category`)
);

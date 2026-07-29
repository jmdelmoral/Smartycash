-- País del cliente (define el país de sus documentos de cobranza).
ALTER TABLE `Client` ADD COLUMN `country` VARCHAR(191) NOT NULL DEFAULT 'Chile';

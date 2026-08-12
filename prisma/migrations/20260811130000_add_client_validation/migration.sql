-- #9 Validación de clientes: estado de validación + fecha de validación.
-- Los clientes preexistentes quedan como 'Validado' por el DEFAULT.
ALTER TABLE `Client`
  ADD COLUMN `validationStatus` ENUM('Pendiente', 'Validado') NOT NULL DEFAULT 'Validado',
  ADD COLUMN `validatedAt` DATETIME(3) NULL;

CREATE INDEX `Client_validationStatus_idx` ON `Client`(`validationStatus`);

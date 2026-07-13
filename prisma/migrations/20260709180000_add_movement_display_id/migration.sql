-- Código visible (displayId) para movimientos de cartola.
ALTER TABLE `CartolaMovement`
  ADD COLUMN `displayId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `CartolaMovement_displayId_key` ON `CartolaMovement`(`displayId`);

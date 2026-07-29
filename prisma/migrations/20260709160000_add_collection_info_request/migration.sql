-- Flujo SWIFT/MT103: Recaudacion solicita informacion adicional al AgenteCC.
ALTER TABLE `CollectionRequest`
  MODIFY COLUMN `status` ENUM('Pendiente', 'Preaprobado', 'Aprobado', 'Rechazado', 'Anulado', 'InformacionSolicitada') NOT NULL DEFAULT 'Pendiente',
  ADD COLUMN `infoRequestComment` VARCHAR(191) NULL,
  ADD COLUMN `infoRequestedAt` DATETIME(3) NULL;

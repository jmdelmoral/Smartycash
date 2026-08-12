-- #11 ID de cotizacion (opcional) asociado a las solicitudes de recaudacion.
ALTER TABLE `CollectionRequest`
  ADD COLUMN `quotationId` VARCHAR(191) NULL;

CREATE INDEX `CollectionRequest_quotationId_idx`
  ON `CollectionRequest`(`quotationId`);

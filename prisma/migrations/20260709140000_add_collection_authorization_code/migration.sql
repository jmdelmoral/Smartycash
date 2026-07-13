-- Feature: codigo de autorizacion del comprobante bancario en solicitudes de recaudacion.
ALTER TABLE `CollectionRequest`
  ADD COLUMN `authorizationCode` VARCHAR(191) NULL;

CREATE INDEX `CollectionRequest_authorizationCode_idx`
  ON `CollectionRequest`(`authorizationCode`);

-- Track de aprobación de FINANZAS (Recaudación), independiente del estado CC.
-- Un caso puede estar "Gestionado CC" y "Aprobado por Finanzas" a la vez.
ALTER TABLE `CollectionRequest`
  ADD COLUMN `financeApproved` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `financeApprovedAt` DATETIME(3) NULL,
  ADD COLUMN `financeApprovedById` VARCHAR(191) NULL;

-- Backfill: las solicitudes ya "Aprobado" quedan aprobadas por Finanzas.
UPDATE `CollectionRequest`
  SET `financeApproved` = true, `financeApprovedAt` = `approvedAt`
  WHERE `status` = 'Aprobado';

ALTER TABLE `CollectionRequest`
  ADD CONSTRAINT `CollectionRequest_financeApprovedById_fkey`
  FOREIGN KEY (`financeApprovedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

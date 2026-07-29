-- Marcas de tiempo por etapa en las solicitudes de recaudación, para el informe
-- de tiempos autogestionable del Agente CC.
ALTER TABLE `CollectionRequest`
  ADD COLUMN `preapprovedAt` DATETIME(3) NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `gestionadoCcAt` DATETIME(3) NULL,
  ADD COLUMN `reversedAt` DATETIME(3) NULL;

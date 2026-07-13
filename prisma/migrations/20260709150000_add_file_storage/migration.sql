-- Almacenamiento real de comprobantes: blob en BD (preparado para migrar a S3).

CREATE TABLE `FileBlob` (
  `id` VARCHAR(191) NOT NULL,
  `data` LONGBLOB NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
);

ALTER TABLE `SupportFile`
  ADD COLUMN `backend` ENUM('Db', 'S3') NOT NULL DEFAULT 'Db',
  ADD COLUMN `collectionRequestId` VARCHAR(191) NULL;

CREATE INDEX `SupportFile_collectionRequestId_idx` ON `SupportFile`(`collectionRequestId`);

ALTER TABLE `SupportFile`
  ADD CONSTRAINT `SupportFile_collectionRequestId_fkey`
  FOREIGN KEY (`collectionRequestId`) REFERENCES `CollectionRequest`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

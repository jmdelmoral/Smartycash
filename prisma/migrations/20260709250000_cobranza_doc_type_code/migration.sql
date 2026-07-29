-- Código de tipo de documento (fiscal/interno), coexistiendo con la categoría `type`.
-- La identidad pasa a ser documentNumber + typeCode + country.
ALTER TABLE `CobranzaDocument` ADD COLUMN `typeCode` VARCHAR(191) NOT NULL DEFAULT '';

-- Backfill: los documentos existentes toman como código su categoría actual.
UPDATE `CobranzaDocument` SET `typeCode` = `type` WHERE `typeCode` = '';

-- Reemplaza la unicidad (documentNumber, type, country) por (documentNumber, typeCode, country).
ALTER TABLE `CobranzaDocument` DROP INDEX `CobranzaDocument_documentNumber_type_country_key`;
ALTER TABLE `CobranzaDocument`
  ADD UNIQUE INDEX `CobranzaDocument_documentNumber_typeCode_country_key` (`documentNumber`, `typeCode`, `country`);

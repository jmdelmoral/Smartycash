-- Identidad del documento de cobranza = documentNumber + type + country.
-- Permite el mismo número para distinto tipo o país sin colisión.
ALTER TABLE `CobranzaDocument` DROP INDEX `CobranzaDocument_documentNumber_type_key`;
ALTER TABLE `CobranzaDocument`
  ADD UNIQUE INDEX `CobranzaDocument_documentNumber_type_country_key` (`documentNumber`, `type`, `country`);

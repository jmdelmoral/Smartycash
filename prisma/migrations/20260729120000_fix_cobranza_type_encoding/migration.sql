-- Corrige la codificacion del valor 'Nota de Credito' del enum CobranzaDocument.type.
-- La migracion 20260609121000 guardo la e acentuada en Latin-1; MySQL (utf8mb4) la
-- almaceno como U+FFFD (EFBFBD, caracter de reemplazo), por lo que insertar una Nota de
-- Credito fallaba con "Value '' not found in enum 'CobranzaDocumentType'". No hay filas
-- con ese valor, asi que redefinir el enum no afecta datos existentes.
ALTER TABLE `CobranzaDocument`
  MODIFY `type` ENUM('Factura', 'Nota de cobro', 'Nota de Crédito') NOT NULL;

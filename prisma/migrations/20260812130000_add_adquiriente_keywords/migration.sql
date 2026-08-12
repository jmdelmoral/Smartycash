-- Palabras clave parametrizables por adquiriente para auto-identificar movimientos
-- de Cartola (match contra descripción/adicionales de movimientos "Sin identificar").
ALTER TABLE `Adquiriente` ADD COLUMN `matchKeywords` TEXT NULL;

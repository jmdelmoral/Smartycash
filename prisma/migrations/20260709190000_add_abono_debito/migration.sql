-- Nueva identificación de cartola: "Abono débito".
ALTER TABLE `CartolaMovement`
  MODIFY COLUMN `identificationType` ENUM('Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito', 'Abono débito') NOT NULL DEFAULT 'Sin identificar';

ALTER TABLE `ClosureItem`
  MODIFY COLUMN `identificationType` ENUM('Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito', 'Abono débito') NOT NULL;

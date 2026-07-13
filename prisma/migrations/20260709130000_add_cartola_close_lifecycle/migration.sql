-- Fase A: ciclo de vida de cierre contable para movimientos de cartola.
-- Campos consumidos por el (futuro) modulo de Contabilidad. No altera el
-- comportamiento actual: closeState nace en 'Abierto' y el resto es nullable.

ALTER TABLE `CartolaMovement`
  ADD COLUMN `closeState` ENUM('Abierto', 'CerradoParcial', 'CerradoDefinitivo') NOT NULL DEFAULT 'Abierto',
  ADD COLUMN `validatedAt` DATETIME(3) NULL,
  ADD COLUMN `asientoContableAt` DATETIME(3) NULL,
  ADD COLUMN `originYear` INT NULL,
  ADD COLUMN `originMonth` INT NULL;

-- Backfill del periodo de origen desde la fecha bancaria de cada movimiento.
UPDATE `CartolaMovement`
SET `originYear` = YEAR(`date`),
    `originMonth` = MONTH(`date`)
WHERE `originYear` IS NULL;

-- Indices para consultas de backlog "por identificar" y agrupacion por periodo.
CREATE INDEX `CartolaMovement_closeState_idx` ON `CartolaMovement`(`closeState`);
CREATE INDEX `CartolaMovement_originYear_originMonth_idx` ON `CartolaMovement`(`originYear`, `originMonth`);

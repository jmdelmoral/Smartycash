-- Decimales parametrizables por cuenta bancaria (0 = CLP/Chile sin decimales,
-- 2 = USD/centavos, etc.). Las cuentas existentes quedan en 0 por el DEFAULT.
ALTER TABLE `BankAccount` ADD COLUMN `decimalPlaces` INT NOT NULL DEFAULT 0;

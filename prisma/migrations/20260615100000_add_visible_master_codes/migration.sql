ALTER TABLE `BankAccount`
  ADD COLUMN `displayId` VARCHAR(191) NULL,
  ADD COLUMN `taxId` VARCHAR(191) NULL,
  ADD COLUMN `legalName` VARCHAR(191) NULL;

ALTER TABLE `Client`
  ADD COLUMN `appCode` VARCHAR(191) NULL;

SET @client_seq := 0;
UPDATE `Client`
SET `appCode` = CONCAT('CLI-', LPAD((@client_seq := @client_seq + 1), 6, '0'))
WHERE `appCode` IS NULL
ORDER BY `createdAt`, `id`;

SET @cl_seq := 0;
UPDATE `BankAccount`
SET `displayId` = CONCAT('CL-CTA-', LPAD((@cl_seq := @cl_seq + 1), 6, '0'))
WHERE `displayId` IS NULL AND LOWER(`country`) IN ('chile', 'cl');

SET @pe_seq := 0;
UPDATE `BankAccount`
SET `displayId` = CONCAT('PE-CTA-', LPAD((@pe_seq := @pe_seq + 1), 6, '0'))
WHERE `displayId` IS NULL AND LOWER(`country`) IN ('peru', 'perú', 'pe');

SET @co_seq := 0;
UPDATE `BankAccount`
SET `displayId` = CONCAT('CO-CTA-', LPAD((@co_seq := @co_seq + 1), 6, '0'))
WHERE `displayId` IS NULL AND LOWER(`country`) IN ('colombia', 'co');

SET @other_seq := 0;
UPDATE `BankAccount`
SET `displayId` = CONCAT('XX-CTA-', LPAD((@other_seq := @other_seq + 1), 6, '0'))
WHERE `displayId` IS NULL;

ALTER TABLE `BankAccount`
  MODIFY `displayId` VARCHAR(191) NOT NULL;

ALTER TABLE `Client`
  MODIFY `appCode` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `BankAccount_displayId_key` ON `BankAccount`(`displayId`);
CREATE INDEX `BankAccount_country_idx` ON `BankAccount`(`country`);
CREATE UNIQUE INDEX `Client_appCode_key` ON `Client`(`appCode`);

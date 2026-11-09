-- Optionally tie a deposit to the approved cash session it banks. Additive, nullable.
ALTER TABLE `Deposit` ADD COLUMN `cashSessionId` VARCHAR(191) NULL;
CREATE INDEX `Deposit_cashSessionId_idx` ON `Deposit`(`cashSessionId`);

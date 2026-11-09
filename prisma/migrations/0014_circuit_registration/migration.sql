-- Additive: registration metadata for Circuits. Existing rows keep NULLs and
-- status ACTIVE; nothing is backfilled or guessed. MySQL allows many NULLs in
-- a UNIQUE index, so legacy circuits without an identification number coexist.

ALTER TABLE `Circuit`
  ADD COLUMN `identificationNumber` VARCHAR(191) NULL,
  ADD COLUMN `location` VARCHAR(191) NULL,
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `registeredAt` DATETIME(3) NULL,
  ADD COLUMN `registeredBy` VARCHAR(191) NULL,
  ADD COLUMN `registrationKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Circuit_identificationNumber_key` ON `Circuit`(`identificationNumber`);
CREATE UNIQUE INDEX `Circuit_registrationKey_key` ON `Circuit`(`registrationKey`);

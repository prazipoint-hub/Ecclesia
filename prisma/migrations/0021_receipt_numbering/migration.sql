-- Receipt numbers were unique across ALL churches while the generator restarted at 1 per church, so a second church's
-- first receipt collided. Numbers become unique per church, backed by an atomic sequence. Existing numbers are kept.
-- Safe: global uniqueness implies per-church uniqueness, so no existing row can violate the new index.

ALTER TABLE `Receipt`
  ADD COLUMN `reference` VARCHAR(191) NULL,
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Receipt_churchId_receiptNumber_key` ON `Receipt`(`churchId`, `receiptNumber`);
CREATE UNIQUE INDEX `Receipt_churchId_idempotencyKey_key` ON `Receipt`(`churchId`, `idempotencyKey`);
DROP INDEX `Receipt_receiptNumber_key` ON `Receipt`;

CREATE TABLE `ReceiptSequence` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `last` INTEGER NOT NULL,

    UNIQUE INDEX `ReceiptSequence_churchId_year_key`(`churchId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

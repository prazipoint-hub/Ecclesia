-- Cash deposits to the bank: a recorded movement awaiting verification by a different person. Additive only.
CREATE TABLE `Deposit` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `depositDate` DATETIME(3) NOT NULL,
    `bankReference` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `idempotencyKey` VARCHAR(191) NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Deposit_churchId_bankReference_key`(`churchId`, `bankReference`),
    UNIQUE INDEX `Deposit_churchId_idempotencyKey_key`(`churchId`, `idempotencyKey`),
    INDEX `Deposit_churchId_status_idx`(`churchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Deposit` ADD CONSTRAINT `Deposit_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

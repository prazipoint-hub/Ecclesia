-- AlterTable
ALTER TABLE `User` ADD COLUMN `disabledAt` DATETIME(3) NULL,
    ADD COLUMN `disabledReason` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SystemSetting_churchId_category_idx`(`churchId`, `category`),
    UNIQUE INDEX `SystemSetting_churchId_key_key`(`churchId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataRetentionRule` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `retentionDays` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `lastPurged` INTEGER NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DataRetentionRule_churchId_entityType_key`(`churchId`, `entityType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SystemSetting` ADD CONSTRAINT `SystemSetting_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRetentionRule` ADD CONSTRAINT `DataRetentionRule_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


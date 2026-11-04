-- AlterTable
ALTER TABLE `Fund` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `isRestricted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `CashSession` ADD COLUMN `cashPaidOut` DECIMAL(65, 30) NULL,
    ADD COLUMN `closedAt` DATETIME(3) NULL,
    ADD COLUMN `closedBy` VARCHAR(191) NULL,
    ADD COLUMN `expectedClosing` DECIMAL(65, 30) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN `variance` DECIMAL(65, 30) NULL,
    MODIFY `closingBalance` DECIMAL(65, 30) NULL;

-- CreateTable
CREATE TABLE `LedgerAccount` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `parentId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LedgerAccount_churchId_idx`(`churchId`),
    INDEX `LedgerAccount_parentId_idx`(`parentId`),
    UNIQUE INDEX `LedgerAccount_churchId_code_key`(`churchId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `closedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialPeriod_churchId_startDate_endDate_idx`(`churchId`, `startDate`, `endDate`),
    UNIQUE INDEX `FinancialPeriod_churchId_name_key`(`churchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalEntry` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `postDate` DATETIME(3) NOT NULL,
    `periodId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `sourceId` VARCHAR(191) NULL,
    `reversesEntryId` VARCHAR(191) NULL,
    `reversalReason` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `postedBy` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `JournalEntry_reversesEntryId_key`(`reversesEntryId`),
    INDEX `JournalEntry_churchId_status_idx`(`churchId`, `status`),
    INDEX `JournalEntry_periodId_idx`(`periodId`),
    INDEX `JournalEntry_postDate_idx`(`postDate`),
    UNIQUE INDEX `JournalEntry_churchId_reference_key`(`churchId`, `reference`),
    UNIQUE INDEX `JournalEntry_churchId_source_sourceId_key`(`churchId`, `source`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalLine` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `debit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `memo` VARCHAR(191) NULL,
    `fundId` VARCHAR(191) NULL,

    INDEX `JournalLine_entryId_idx`(`entryId`),
    INDEX `JournalLine_accountId_idx`(`accountId`),
    INDEX `JournalLine_fundId_idx`(`fundId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Budget` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `fiscalYear` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Budget_churchId_fiscalYear_idx`(`churchId`, `fiscalYear`),
    UNIQUE INDEX `Budget_churchId_name_fiscalYear_key`(`churchId`, `name`, `fiscalYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BudgetItem` (
    `id` VARCHAR(191) NOT NULL,
    `budgetId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `fundId` VARCHAR(191) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,

    INDEX `BudgetItem_budgetId_idx`(`budgetId`),
    INDEX `BudgetItem_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LedgerAccount` ADD CONSTRAINT `LedgerAccount_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerAccount` ADD CONSTRAINT `LedgerAccount_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `LedgerAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialPeriod` ADD CONSTRAINT `FinancialPeriod_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `FinancialPeriod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `JournalEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `LedgerAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Budget` ADD CONSTRAINT `Budget_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BudgetItem` ADD CONSTRAINT `BudgetItem_budgetId_fkey` FOREIGN KEY (`budgetId`) REFERENCES `Budget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BudgetItem` ADD CONSTRAINT `BudgetItem_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `LedgerAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sessions recorded before the open/close workflow existed were all complete.
UPDATE `CashSession` SET `status` = 'CLOSED', `closedAt` = `createdAt` WHERE `closingBalance` IS NOT NULL;

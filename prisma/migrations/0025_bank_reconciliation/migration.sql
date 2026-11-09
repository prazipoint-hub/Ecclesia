-- Bank reconciliation: statement lines matched to posted Bank (1100) journal lines. Additive only.
CREATE TABLE `BankReconciliation` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `statementOpening` DECIMAL(14, 2) NOT NULL,
    `statementClosing` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdBy` VARCHAR(191) NOT NULL,
    `completedBy` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `summaryJson` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankReconciliation_churchId_status_idx`(`churchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BankStatementLine` (
    `id` VARCHAR(191) NOT NULL,
    `reconciliationId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `lineDate` DATETIME(3) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `lineHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNMATCHED',
    `matchedJournalLineId` VARCHAR(191) NULL,
    `matchedBy` VARCHAR(191) NULL,
    `matchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BankStatementLine_matchedJournalLineId_key`(`matchedJournalLineId`),
    UNIQUE INDEX `BankStatementLine_reconciliationId_lineHash_key`(`reconciliationId`, `lineHash`),
    INDEX `BankStatementLine_reconciliationId_status_idx`(`reconciliationId`, `status`),
    INDEX `BankStatementLine_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BankReconciliation` ADD CONSTRAINT `BankReconciliation_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_reconciliationId_fkey` FOREIGN KEY (`reconciliationId`) REFERENCES `BankReconciliation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

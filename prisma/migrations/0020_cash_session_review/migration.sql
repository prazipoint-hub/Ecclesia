-- Additive: cash session review workflow. Existing sessions keep their status (OPEN / CLOSED) and values.
ALTER TABLE `CashSession`
  ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `submittedBy` VARCHAR(191) NULL,
  ADD COLUMN `submissionNo` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `countsJson` TEXT NULL,
  ADD COLUMN `snapshotJson` TEXT NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `reviewedBy` VARCHAR(191) NULL,
  ADD COLUMN `reviewNote` TEXT NULL;

ALTER TABLE `Receipt` ADD COLUMN `cashSessionId` VARCHAR(191) NULL;
CREATE INDEX `Receipt_cashSessionId_idx` ON `Receipt`(`cashSessionId`);
ALTER TABLE `Receipt` ADD CONSTRAINT `Receipt_cashSessionId_fkey`
  FOREIGN KEY (`cashSessionId`) REFERENCES `CashSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `CashSessionEvent` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `data` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CashSessionEvent_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CashSessionEvent` ADD CONSTRAINT `CashSessionEvent_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `CashSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

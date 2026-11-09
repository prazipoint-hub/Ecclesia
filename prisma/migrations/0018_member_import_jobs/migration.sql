-- Additive: staged membership import jobs. The legacy MemberImport table is untouched.
CREATE TABLE `MemberImportJob` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `templateVersion` VARCHAR(191) NOT NULL,
    `contentHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PREVIEWED',
    `totalRows` INTEGER NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `heartbeatAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberImportJob_churchId_contentHash_idx`(`churchId`, `contentHash`),
    INDEX `MemberImportJob_churchId_createdAt_idx`(`churchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MemberImportRow` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `raw` TEXT NOT NULL,
    `parsed` TEXT NULL,
    `status` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `errors` TEXT NULL,
    `warnings` TEXT NULL,
    `matches` TEXT NULL,
    `decision` VARCHAR(191) NULL,
    `memberId` VARCHAR(191) NULL,

    UNIQUE INDEX `MemberImportRow_jobId_rowNumber_key`(`jobId`, `rowNumber`),
    INDEX `MemberImportRow_jobId_status_idx`(`jobId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MemberImportJob` ADD CONSTRAINT `MemberImportJob_churchId_fkey`
  FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MemberImportRow` ADD CONSTRAINT `MemberImportRow_jobId_fkey`
  FOREIGN KEY (`jobId`) REFERENCES `MemberImportJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

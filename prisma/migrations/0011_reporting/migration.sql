-- CreateTable
CREATE TABLE `SavedReport` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `parameters` JSON NOT NULL,
    `format` VARCHAR(191) NOT NULL DEFAULT 'PDF',
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'PRIVATE',
    `schedule` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `recipients` JSON NULL,
    `nextRunAt` DATETIME(3) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SavedReport_churchId_visibility_idx`(`churchId`, `visibility`),
    INDEX `SavedReport_createdBy_idx`(`createdBy`),
    INDEX `SavedReport_schedule_isActive_nextRunAt_idx`(`schedule`, `isActive`, `nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportExecution` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RUNNING',
    `rowCount` INTEGER NULL,
    `byteSize` INTEGER NULL,
    `filename` VARCHAR(191) NULL,
    `error` VARCHAR(191) NULL,
    `deliveredTo` JSON NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `ReportExecution_churchId_startedAt_idx`(`churchId`, `startedAt`),
    INDEX `ReportExecution_reportId_idx`(`reportId`),
    INDEX `ReportExecution_requestedBy_idx`(`requestedBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SavedReport` ADD CONSTRAINT `SavedReport_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportExecution` ADD CONSTRAINT `ReportExecution_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportExecution` ADD CONSTRAINT `ReportExecution_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `SavedReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


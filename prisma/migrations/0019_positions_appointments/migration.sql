-- Additive: position catalogue, appointments (with history) and a job "kind" so leadership imports reuse the staging tables.
ALTER TABLE `MemberImportJob` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'MEMBERS';

CREATE TABLE `PositionDefinition` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL,
    `scopeKind` VARCHAR(191) NOT NULL DEFAULT 'CHURCH',
    `aliases` TEXT NULL,
    `allowMultiple` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `mappedRoleId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PositionDefinition_churchId_code_key`(`churchId`, `code`),
    INDEX `PositionDefinition_churchId_groupName_idx`(`churchId`, `groupName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Appointment` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `positionId` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NULL,
    `committeeId` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `termStart` DATETIME(3) NOT NULL,
    `termEnd` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `revokedBy` VARCHAR(191) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokeReason` VARCHAR(191) NULL,
    `importJobId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Appointment_memberId_positionId_scopeType_scopeId_termStart_key`(`memberId`, `positionId`, `scopeType`, `scopeId`, `termStart`),
    INDEX `Appointment_churchId_status_idx`(`churchId`, `status`),
    INDEX `Appointment_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PositionDefinition` ADD CONSTRAINT `PositionDefinition_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `PositionDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

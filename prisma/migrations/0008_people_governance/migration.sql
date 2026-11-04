-- AlterTable
ALTER TABLE `Member` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `archivedBy` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `MemberImport` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `totalRows` INTEGER NOT NULL,
    `imported` INTEGER NOT NULL,
    `skipped` INTEGER NOT NULL,
    `errorLog` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberImport_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Visitor` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `visitDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `followUpStatus` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `assignedToId` VARCHAR(191) NULL,
    `convertedMemberId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Visitor_convertedMemberId_key`(`convertedMemberId`),
    INDEX `Visitor_churchId_idx`(`churchId`),
    INDEX `Visitor_churchId_followUpStatus_idx`(`churchId`, `followUpStatus`),
    INDEX `Visitor_assignedToId_idx`(`assignedToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisitorFollowUp` (
    `id` VARCHAR(191) NOT NULL,
    `visitorId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VisitorFollowUp_visitorId_idx`(`visitorId`),
    INDEX `VisitorFollowUp_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommitteeMeeting` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `committeeId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `location` VARCHAR(191) NULL,
    `agenda` TEXT NULL,
    `minutes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED',
    `minutesLockedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommitteeMeeting_churchId_idx`(`churchId`),
    INDEX `CommitteeMeeting_committeeId_idx`(`committeeId`),
    INDEX `CommitteeMeeting_scheduledAt_idx`(`scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommitteeDecision` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PROPOSED',
    `votesFor` INTEGER NOT NULL DEFAULT 0,
    `votesAgainst` INTEGER NOT NULL DEFAULT 0,
    `abstentions` INTEGER NOT NULL DEFAULT 0,
    `ownerMemberId` VARCHAR(191) NULL,
    `dueDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommitteeDecision_meetingId_idx`(`meetingId`),
    INDEX `CommitteeDecision_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadershipTerm` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `termNumber` INTEGER NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `plannedEndDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `successorId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadershipTerm_churchId_idx`(`churchId`),
    INDEX `LeadershipTerm_status_plannedEndDate_idx`(`status`, `plannedEndDate`),
    UNIQUE INDEX `LeadershipTerm_assignmentId_termNumber_key`(`assignmentId`, `termNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Member_archivedAt_idx` ON `Member`(`archivedAt`);

-- AddForeignKey
ALTER TABLE `MemberImport` ADD CONSTRAINT `MemberImport_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Visitor` ADD CONSTRAINT `Visitor_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VisitorFollowUp` ADD CONSTRAINT `VisitorFollowUp_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitteeMeeting` ADD CONSTRAINT `CommitteeMeeting_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitteeMeeting` ADD CONSTRAINT `CommitteeMeeting_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `Committee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitteeDecision` ADD CONSTRAINT `CommitteeDecision_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `CommitteeMeeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadershipTerm` ADD CONSTRAINT `LeadershipTerm_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadershipTerm` ADD CONSTRAINT `LeadershipTerm_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `LeadershipAssignment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


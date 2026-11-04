-- AlterTable
ALTER TABLE `Event` ADD COLUMN `capacity` INTEGER NULL,
    ADD COLUMN `registrationRequired` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `EventRegistration` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REGISTERED',
    `registeredBy` VARCHAR(191) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EventRegistration_churchId_idx`(`churchId`),
    INDEX `EventRegistration_eventId_status_idx`(`eventId`, `status`),
    INDEX `EventRegistration_memberId_idx`(`memberId`),
    UNIQUE INDEX `EventRegistration_eventId_memberId_key`(`eventId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventCheckIn` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `checkedInBy` VARCHAR(191) NOT NULL,
    `checkedInAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventCheckIn_churchId_idx`(`churchId`),
    INDEX `EventCheckIn_eventId_idx`(`eventId`),
    INDEX `EventCheckIn_memberId_idx`(`memberId`),
    UNIQUE INDEX `EventCheckIn_eventId_memberId_key`(`eventId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VolunteerSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ASSIGNED',
    `notes` TEXT NULL,
    `assignedBy` VARCHAR(191) NOT NULL,
    `respondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VolunteerSchedule_churchId_idx`(`churchId`),
    INDEX `VolunteerSchedule_eventId_idx`(`eventId`),
    INDEX `VolunteerSchedule_memberId_status_idx`(`memberId`, `status`),
    UNIQUE INDEX `VolunteerSchedule_eventId_memberId_role_key`(`eventId`, `memberId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AbsenceFollowUp` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `consecutiveAbsences` INTEGER NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `openKey` VARCHAR(191) NULL DEFAULT 'OPEN',
    `assignedTo` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AbsenceFollowUp_churchId_status_idx`(`churchId`, `status`),
    INDEX `AbsenceFollowUp_assignedTo_idx`(`assignedTo`),
    UNIQUE INDEX `AbsenceFollowUp_churchId_memberId_openKey_key`(`churchId`, `memberId`, `openKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventRegistration` ADD CONSTRAINT `EventRegistration_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventRegistration` ADD CONSTRAINT `EventRegistration_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventRegistration` ADD CONSTRAINT `EventRegistration_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCheckIn` ADD CONSTRAINT `EventCheckIn_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCheckIn` ADD CONSTRAINT `EventCheckIn_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCheckIn` ADD CONSTRAINT `EventCheckIn_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VolunteerSchedule` ADD CONSTRAINT `VolunteerSchedule_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VolunteerSchedule` ADD CONSTRAINT `VolunteerSchedule_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VolunteerSchedule` ADD CONSTRAINT `VolunteerSchedule_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbsenceFollowUp` ADD CONSTRAINT `AbsenceFollowUp_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbsenceFollowUp` ADD CONSTRAINT `AbsenceFollowUp_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


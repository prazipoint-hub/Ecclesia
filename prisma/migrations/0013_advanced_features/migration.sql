-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `fundId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `goalAmount` DECIMAL(65, 30) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Campaign_fundId_key`(`fundId`),
    UNIQUE INDEX `Campaign_slug_key`(`slug`),
    INDEX `Campaign_churchId_idx`(`churchId`),
    INDEX `Campaign_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmallGroup` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `meetingDay` VARCHAR(191) NULL,
    `meetingTime` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `curriculumName` VARCHAR(191) NULL,
    `capacity` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SmallGroup_churchId_idx`(`churchId`),
    UNIQUE INDEX `SmallGroup_churchId_name_key`(`churchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmallGroupMember` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'MEMBER',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,

    INDEX `SmallGroupMember_groupId_idx`(`groupId`),
    INDEX `SmallGroupMember_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmallGroupSession` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `heldOn` DATETIME(3) NOT NULL,
    `topic` VARCHAR(191) NOT NULL,
    `lesson` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SmallGroupSession_groupId_idx`(`groupId`),
    INDEX `SmallGroupSession_heldOn_idx`(`heldOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmallGroupAttendance` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `membershipId` VARCHAR(191) NOT NULL,
    `present` BOOLEAN NOT NULL DEFAULT true,

    INDEX `SmallGroupAttendance_membershipId_idx`(`membershipId`),
    UNIQUE INDEX `SmallGroupAttendance_sessionId_membershipId_key`(`sessionId`, `membershipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DocumentTemplate_churchId_idx`(`churchId`),
    UNIQUE INDEX `DocumentTemplate_churchId_name_key`(`churchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratedDocument` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `serial` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `issuedBy` VARCHAR(191) NOT NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GeneratedDocument_serial_key`(`serial`),
    INDEX `GeneratedDocument_churchId_idx`(`churchId`),
    INDEX `GeneratedDocument_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetCategory` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `AssetCategory_churchId_name_key`(`churchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `tag` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `purchaseDate` DATETIME(3) NULL,
    `purchaseCost` DECIMAL(65, 30) NULL,
    `serialNumber` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `retiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Asset_churchId_idx`(`churchId`),
    INDEX `Asset_categoryId_idx`(`categoryId`),
    UNIQUE INDEX `Asset_churchId_tag_key`(`churchId`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetMaintenance` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `performedOn` DATETIME(3) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `cost` DECIMAL(65, 30) NULL,
    `nextDueDate` DATETIME(3) NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssetMaintenance_assetId_idx`(`assetId`),
    INDEX `AssetMaintenance_nextDueDate_idx`(`nextDueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarFeed` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CalendarFeed_tokenHash_key`(`tokenHash`),
    INDEX `CalendarFeed_userId_idx`(`userId`),
    INDEX `CalendarFeed_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_fundId_fkey` FOREIGN KEY (`fundId`) REFERENCES `Fund`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmallGroup` ADD CONSTRAINT `SmallGroup_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmallGroupMember` ADD CONSTRAINT `SmallGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `SmallGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmallGroupMember` ADD CONSTRAINT `SmallGroupMember_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmallGroupSession` ADD CONSTRAINT `SmallGroupSession_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `SmallGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmallGroupAttendance` ADD CONSTRAINT `SmallGroupAttendance_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `SmallGroupSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmallGroupAttendance` ADD CONSTRAINT `SmallGroupAttendance_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `SmallGroupMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentTemplate` ADD CONSTRAINT `DocumentTemplate_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedDocument` ADD CONSTRAINT `GeneratedDocument_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedDocument` ADD CONSTRAINT `GeneratedDocument_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `DocumentTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedDocument` ADD CONSTRAINT `GeneratedDocument_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetCategory` ADD CONSTRAINT `AssetCategory_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `AssetCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetMaintenance` ADD CONSTRAINT `AssetMaintenance_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarFeed` ADD CONSTRAINT `CalendarFeed_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarFeed` ADD CONSTRAINT `CalendarFeed_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


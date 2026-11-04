-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `fundId` VARCHAR(191) NOT NULL,
    `pledgeId` VARCHAR(191) NULL,
    `recurringGivingId` VARCHAR(191) NULL,
    `receiptId` VARCHAR(191) NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `incomeType` VARCHAR(191) NOT NULL,
    `gateway` VARCHAR(191) NOT NULL DEFAULT 'PAYNOW',
    `method` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NOT NULL,
    `gatewayRef` VARCHAR(191) NULL,
    `pollUrl` TEXT NULL,
    `redirectUrl` TEXT NULL,
    `instructions` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `failureReason` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Payment_receiptId_key`(`receiptId`),
    UNIQUE INDEX `Payment_reference_key`(`reference`),
    INDEX `Payment_churchId_idx`(`churchId`),
    INDEX `Payment_memberId_idx`(`memberId`),
    INDEX `Payment_fundId_idx`(`fundId`),
    INDEX `Payment_pledgeId_idx`(`pledgeId`),
    INDEX `Payment_recurringGivingId_idx`(`recurringGivingId`),
    INDEX `Payment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedPaymentMethod` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedPaymentMethod_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pledge` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `fundId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `targetAmount` DECIMAL(65, 30) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Pledge_churchId_idx`(`churchId`),
    INDEX `Pledge_memberId_idx`(`memberId`),
    INDEX `Pledge_fundId_idx`(`fundId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringGiving` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `fundId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `incomeType` VARCHAR(191) NOT NULL DEFAULT 'OFFERING',
    `frequency` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `nextChargeDate` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecurringGiving_churchId_idx`(`churchId`),
    INDEX `RecurringGiving_memberId_idx`(`memberId`),
    INDEX `RecurringGiving_fundId_idx`(`fundId`),
    INDEX `RecurringGiving_isActive_nextChargeDate_idx`(`isActive`, `nextChargeDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_fundId_fkey` FOREIGN KEY (`fundId`) REFERENCES `Fund`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_pledgeId_fkey` FOREIGN KEY (`pledgeId`) REFERENCES `Pledge`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_recurringGivingId_fkey` FOREIGN KEY (`recurringGivingId`) REFERENCES `RecurringGiving`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `Receipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedPaymentMethod` ADD CONSTRAINT `SavedPaymentMethod_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pledge` ADD CONSTRAINT `Pledge_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pledge` ADD CONSTRAINT `Pledge_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pledge` ADD CONSTRAINT `Pledge_fundId_fkey` FOREIGN KEY (`fundId`) REFERENCES `Fund`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringGiving` ADD CONSTRAINT `RecurringGiving_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `Church`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringGiving` ADD CONSTRAINT `RecurringGiving_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringGiving` ADD CONSTRAINT `RecurringGiving_fundId_fkey` FOREIGN KEY (`fundId`) REFERENCES `Fund`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


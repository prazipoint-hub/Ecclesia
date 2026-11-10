-- Profile photo, guardian links for minors, church-defined extra profile fields. Additive only.
CREATE TABLE `MemberPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `data` LONGBLOB NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MemberPhoto_memberId_key`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GuardianLink` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `guardianMemberId` VARCHAR(191) NOT NULL,
    `minorMemberId` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdBy` VARCHAR(191) NOT NULL,
    `revokedBy` VARCHAR(191) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GuardianLink_guardianMemberId_minorMemberId_key`(`guardianMemberId`, `minorMemberId`),
    INDEX `GuardianLink_churchId_status_idx`(`churchId`, `status`),
    INDEX `GuardianLink_minorMemberId_idx`(`minorMemberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProfileFieldDefinition` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `fieldType` VARCHAR(191) NOT NULL,
    `options` JSON NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProfileFieldDefinition_churchId_key_key`(`churchId`, `key`),
    INDEX `ProfileFieldDefinition_churchId_active_idx`(`churchId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProfileFieldValue` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `fieldId` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProfileFieldValue_memberId_fieldId_key`(`memberId`, `fieldId`),
    INDEX `ProfileFieldValue_fieldId_idx`(`fieldId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MemberPhoto` ADD CONSTRAINT `MemberPhoto_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProfileFieldValue` ADD CONSTRAINT `ProfileFieldValue_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProfileFieldValue` ADD CONSTRAINT `ProfileFieldValue_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `ProfileFieldDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

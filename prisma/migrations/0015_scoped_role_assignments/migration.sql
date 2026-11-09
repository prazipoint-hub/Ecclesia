-- Additive: scoped role grants. Existing church-level roles/JWT permissions are untouched.
CREATE TABLE `ScopedRoleAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `sourceId` VARCHAR(191) NOT NULL DEFAULT '',
    `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endsAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedBy` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScopedRoleAssignment_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `ScopedRoleAssignment_scopeType_scopeId_idx`(`scopeType`, `scopeId`),
    UNIQUE INDEX `ScopedRoleAssignment_grant_key`(`userId`, `roleId`, `scopeType`, `scopeId`, `sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ScopedRoleAssignment` ADD CONSTRAINT `ScopedRoleAssignment_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ScopedRoleAssignment` ADD CONSTRAINT `ScopedRoleAssignment_roleId_fkey`
  FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Expand the existing Circuit -> Church -> Section structure without changing
-- current records. Existing circuits remain valid with a NULL districtId until
-- they are explicitly assigned during a later data migration.

CREATE TABLE `Conference` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Conference_name_key`(`name`),
    UNIQUE INDEX `Conference_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `District` (
    `id` VARCHAR(191) NOT NULL,
    `conferenceId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `District_conferenceId_idx`(`conferenceId`),
    UNIQUE INDEX `District_conferenceId_name_key`(`conferenceId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Circuit` ADD COLUMN `districtId` VARCHAR(191) NULL;
CREATE INDEX `Circuit_districtId_idx` ON `Circuit`(`districtId`);

ALTER TABLE `District` ADD CONSTRAINT `District_conferenceId_fkey`
  FOREIGN KEY (`conferenceId`) REFERENCES `Conference`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Circuit` ADD CONSTRAINT `Circuit_districtId_fkey`
  FOREIGN KEY (`districtId`) REFERENCES `District`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

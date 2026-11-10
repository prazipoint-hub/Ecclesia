-- Per-approver decisions so a church can require two different approvers above a threshold. Additive only.
CREATE TABLE `ExpenditureApproval` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `expenditureId` VARCHAR(191) NOT NULL,
    `approverId` VARCHAR(191) NOT NULL,
    `decision` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExpenditureApproval_kind_expenditureId_approverId_key`(`kind`, `expenditureId`, `approverId`),
    INDEX `ExpenditureApproval_kind_expenditureId_idx`(`kind`, `expenditureId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

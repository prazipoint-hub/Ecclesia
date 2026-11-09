-- Additive: onboarding completion markers and per-step confirmations.
ALTER TABLE `Circuit` ADD COLUMN `onboardedAt` DATETIME(3) NULL, ADD COLUMN `onboardedBy` VARCHAR(191) NULL;

CREATE TABLE `CircuitOnboardingStep` (
    `id` VARCHAR(191) NOT NULL,
    `circuitId` VARCHAR(191) NOT NULL,
    `step` VARCHAR(191) NOT NULL,
    `confirmedBy` VARCHAR(191) NOT NULL,
    `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CircuitOnboardingStep_circuitId_step_key`(`circuitId`, `step`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CircuitOnboardingStep` ADD CONSTRAINT `CircuitOnboardingStep_circuitId_fkey`
  FOREIGN KEY (`circuitId`) REFERENCES `Circuit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

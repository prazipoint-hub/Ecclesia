-- Additive: an invitation may carry a scoped grant that is applied when it is accepted.
ALTER TABLE `Invitation`
  ADD COLUMN `grantRoleId` VARCHAR(191) NULL,
  ADD COLUMN `grantScopeType` VARCHAR(191) NULL,
  ADD COLUMN `grantScopeId` VARCHAR(191) NULL;

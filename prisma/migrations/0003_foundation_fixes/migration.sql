-- AlterTable
ALTER TABLE `Session` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `FamilyRelationship` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `OrganizationMembership` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `OrganizationRoleAssignment` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `EventParticipant` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Receipt` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `CashSession` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `SectionReceipt` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `SectionExpenditure` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `SectionTransaction` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `MembershipStatusChange` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `StatusChangeApproval` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `CircuitReceipt` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `CircuitExpenditure` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `DistrictReceipt` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `DistrictExpenditure` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `Member_parentId_idx` ON `Member`(`parentId`);

-- CreateIndex
CREATE INDEX `Member_parentMemberId_idx` ON `Member`(`parentMemberId`);

-- CreateIndex
CREATE INDEX `FamilyRelationship_partner1Id_idx` ON `FamilyRelationship`(`partner1Id`);

-- CreateIndex
CREATE INDEX `FamilyRelationship_partner2Id_idx` ON `FamilyRelationship`(`partner2Id`);

-- CreateIndex
CREATE INDEX `FamilyRelationship_parentId_idx` ON `FamilyRelationship`(`parentId`);

-- CreateIndex
CREATE INDEX `FamilyRelationship_childId_idx` ON `FamilyRelationship`(`childId`);

-- CreateIndex
CREATE INDEX `FamilyRelationship_memberId_idx` ON `FamilyRelationship`(`memberId`);

-- CreateIndex
CREATE INDEX `FamilyRelationship_familyId_idx` ON `FamilyRelationship`(`familyId`);

-- CreateIndex
CREATE INDEX `EventParticipant_memberId_idx` ON `EventParticipant`(`memberId`);

-- CreateIndex
CREATE INDEX `Receipt_financialAccountId_idx` ON `Receipt`(`financialAccountId`);

-- CreateIndex
CREATE INDEX `Expenditure_requestedBy_idx` ON `Expenditure`(`requestedBy`);

-- CreateIndex
CREATE INDEX `Expenditure_financialAccountId_idx` ON `Expenditure`(`financialAccountId`);

-- CreateIndex
CREATE INDEX `SectionReceipt_memberId_idx` ON `SectionReceipt`(`memberId`);

-- CreateIndex
CREATE INDEX `PastoralCase_assignedPastorId_idx` ON `PastoralCase`(`assignedPastorId`);

-- CreateIndex
CREATE INDEX `PastoralFollowUp_caseId_idx` ON `PastoralFollowUp`(`caseId`);

-- CreateIndex
CREATE INDEX `MembershipStatusChange_requestedById_idx` ON `MembershipStatusChange`(`requestedById`);

-- CreateIndex
CREATE INDEX `MembershipStatusChange_approvedById_idx` ON `MembershipStatusChange`(`approvedById`);


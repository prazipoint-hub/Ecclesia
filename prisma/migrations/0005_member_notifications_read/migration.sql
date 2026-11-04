-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `readAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Notification_recipientId_idx` ON `Notification`(`recipientId`);


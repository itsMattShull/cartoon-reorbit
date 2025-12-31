-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "sendError" TEXT,
ADD COLUMN     "sendErrorAt" TIMESTAMP(3),
ADD COLUMN     "sendingAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Announcement_sendingAt_idx" ON "Announcement"("sendingAt");

-- CreateIndex
CREATE INDEX "Announcement_sendErrorAt_idx" ON "Announcement"("sendErrorAt");

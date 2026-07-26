-- AlterTable
ALTER TABLE "AdminChangeLog" ADD COLUMN     "targetUserId" TEXT,
ADD COLUMN     "targetUsername" TEXT;

-- CreateIndex
CREATE INDEX "AdminChangeLog_targetUserId_createdAt_idx" ON "AdminChangeLog"("targetUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminChangeLog" ADD CONSTRAINT "AdminChangeLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

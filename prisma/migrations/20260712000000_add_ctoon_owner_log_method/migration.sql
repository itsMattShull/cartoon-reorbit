-- AlterTable
ALTER TABLE "CtoonOwnerLog" ADD COLUMN     "method" TEXT,
ADD COLUMN     "counterpartyUserId" TEXT,
ADD COLUMN     "counterpartyUsername" TEXT;

-- AddForeignKey
ALTER TABLE "CtoonOwnerLog" ADD CONSTRAINT "CtoonOwnerLog_counterpartyUserId_fkey" FOREIGN KEY ("counterpartyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

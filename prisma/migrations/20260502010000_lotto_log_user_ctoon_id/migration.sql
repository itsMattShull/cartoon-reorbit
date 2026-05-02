-- AlterTable: add optional userCtoonId to LottoLog for tracking cToon wins
ALTER TABLE "LottoLog" ADD COLUMN "userCtoonId" TEXT;

-- AddForeignKey
ALTER TABLE "LottoLog" ADD CONSTRAINT "LottoLog_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "LottoLog_userCtoonId_idx" ON "LottoLog"("userCtoonId");

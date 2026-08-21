-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "teamScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserDailyTaskCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDailyTaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonScoreLog" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "detail" TEXT,
    "points" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonScoreLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GamePointLog_createdAt_idx" ON "GamePointLog"("createdAt");

-- CreateIndex
CREATE INDEX "WheelSpinLog_createdAt_idx" ON "WheelSpinLog"("createdAt");

-- CreateIndex
CREATE INDEX "UserBarcodeScan_lastScannedAt_idx" ON "UserBarcodeScan"("lastScannedAt");

-- CreateIndex
CREATE INDEX "CMoon_teamScore_idx" ON "CMoon"("teamScore");

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyTaskCompletion_userId_date_key" ON "UserDailyTaskCompletion"("userId", "date");

-- CreateIndex
CREATE INDEX "UserDailyTaskCompletion_date_idx" ON "UserDailyTaskCompletion"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonScoreLog_cMoonId_userId_category_weekStart_detail_key" ON "CMoonScoreLog"("cMoonId", "userId", "category", "weekStart", "detail");

-- CreateIndex
CREATE INDEX "CMoonScoreLog_weekStart_idx" ON "CMoonScoreLog"("weekStart");

-- AddForeignKey
ALTER TABLE "UserDailyTaskCompletion" ADD CONSTRAINT "UserDailyTaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonScoreLog" ADD CONSTRAINT "CMoonScoreLog_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DailyStreakRewardType" AS ENUM ('CTOON', 'PACK', 'POINTS', 'CMOON_POINTS');

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "dailyStreakCronClaimToken" TEXT,
ADD COLUMN     "dailyStreakCronClaimedAt" TIMESTAMP(3),
ADD COLUMN     "dailyStreakRepeatEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyStreakCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailyStreakLastBoundary" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DailyStreakReward" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "rewardType" "DailyStreakRewardType" NOT NULL,
    "ctoonId" TEXT,
    "packId" TEXT,
    "amount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStreakReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStreakClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "streakDay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStreakClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyStreakReward_day_idx" ON "DailyStreakReward"("day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStreakClaim_userId_streakDay_key" ON "DailyStreakClaim"("userId", "streakDay");

-- AddForeignKey
ALTER TABLE "DailyStreakReward" ADD CONSTRAINT "DailyStreakReward_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStreakReward" ADD CONSTRAINT "DailyStreakReward_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStreakClaim" ADD CONSTRAINT "DailyStreakClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

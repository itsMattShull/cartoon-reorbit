-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "dailyStreakMorningCronClaimToken" TEXT,
ADD COLUMN     "dailyStreakMorningCronClaimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyStreakPendingBoundary" TIMESTAMP(3);

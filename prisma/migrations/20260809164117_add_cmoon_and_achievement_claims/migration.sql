/*
  Warnings:

  - Made the column `dissolveScheduleCadenceDays` on table `GlobalGameConfig` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dissolveScheduleFeaturedPerCadence` on table `GlobalGameConfig` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dissolveScheduleOtherPerCadence` on table `GlobalGameConfig` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "isClaimable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonEnabledAt" TIMESTAMP(3),
ADD COLUMN     "cMoonSelectionDeadlineAt" TIMESTAMP(3),
ALTER COLUMN "dissolveScheduleCadenceDays" SET NOT NULL,
ALTER COLUMN "dissolveScheduleFeaturedPerCadence" SET NOT NULL,
ALTER COLUMN "dissolveScheduleOtherPerCadence" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cMoonAutoAssigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonId" TEXT,
ADD COLUMN     "cMoonRoleGrantedAt" TIMESTAMP(3),
ADD COLUMN     "cMoonSelectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AchievementClaimOption" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "ctoonId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AchievementClaimOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementClaim" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "discordRoleId" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonCaptain" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CMoonCaptain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPrizeCtoon" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CMoonPrizeCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AchievementClaimOption_achievementId_sortOrder_idx" ON "AchievementClaimOption"("achievementId", "sortOrder");

-- CreateIndex
CREATE INDEX "AchievementClaim_userId_idx" ON "AchievementClaim"("userId");

-- CreateIndex
CREATE INDEX "AchievementClaim_optionId_idx" ON "AchievementClaim"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementClaim_achievementId_userId_key" ON "AchievementClaim"("achievementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoon_name_key" ON "CMoon"("name");

-- CreateIndex
CREATE INDEX "CMoon_memberCount_idx" ON "CMoon"("memberCount");

-- CreateIndex
CREATE INDEX "CMoonCaptain_userId_idx" ON "CMoonCaptain"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonCaptain_cMoonId_userId_key" ON "CMoonCaptain"("cMoonId", "userId");

-- CreateIndex
CREATE INDEX "CMoonPrizeCtoon_ctoonId_idx" ON "CMoonPrizeCtoon"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPrizeCtoon_cMoonId_ctoonId_key" ON "CMoonPrizeCtoon"("cMoonId", "ctoonId");

-- CreateIndex
CREATE INDEX "User_cMoonId_idx" ON "User"("cMoonId");

-- CreateIndex
CREATE INDEX "User_cMoonId_cMoonRoleGrantedAt_idx" ON "User"("cMoonId", "cMoonRoleGrantedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementClaimOption" ADD CONSTRAINT "AchievementClaimOption_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementClaimOption" ADD CONSTRAINT "AchievementClaimOption_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementClaim" ADD CONSTRAINT "AchievementClaim_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementClaim" ADD CONSTRAINT "AchievementClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementClaim" ADD CONSTRAINT "AchievementClaim_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AchievementClaimOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonCaptain" ADD CONSTRAINT "CMoonCaptain_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonCaptain" ADD CONSTRAINT "CMoonCaptain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrizeCtoon" ADD CONSTRAINT "CMoonPrizeCtoon_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrizeCtoon" ADD CONSTRAINT "CMoonPrizeCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

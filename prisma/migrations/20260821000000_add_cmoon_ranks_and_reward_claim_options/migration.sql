/*
  Warnings:

  - You are about to drop the column `ctoonId` on the `AchievementClaimOption` table. All the data
    in that column (and `points`/`quantity`) is preserved by migrating it into a new, dedicated
    `AchievementReward` row per option (see the data-migration block below) before the columns are
    dropped — do NOT let a future `prisma migrate dev` regenerate this file, it will just emit a
    bare DROP COLUMN and silently lose every existing claim option's prize ctoon.
  - A unique constraint covering the columns `[rewardId]` on the table `AchievementClaimOption`
    will be added.

*/

-- CreateTable
CREATE TABLE "CMoonRank" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "discordRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonRank_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "cMoonPointsGte" INTEGER,
ADD COLUMN     "cMoonRankId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cMoonPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cMoonRankRoleGrantedAt" TIMESTAMP(3),
ADD COLUMN     "currentCMoonRankId" TEXT;

-- AlterTable: add the new column nullable first so we can backfill it per-row below.
ALTER TABLE "AchievementClaimOption" ADD COLUMN "rewardId" TEXT;

-- Data migration: give every existing claim option its own dedicated AchievementReward row,
-- carrying over its `points` value and (if set) its single prize ctoon, so nothing existing
-- claim option data is lost when `ctoonId`/`points`/`quantity` are dropped below. The reward
-- id is generated here (not left to a DB default) specifically so it can be reused to link
-- the option to the reward it names.
UPDATE "AchievementClaimOption" SET "rewardId" = gen_random_uuid()::text WHERE "rewardId" IS NULL;

INSERT INTO "AchievementReward" ("id", "achievementId", "points")
SELECT "rewardId", "achievementId", "points" FROM "AchievementClaimOption";

INSERT INTO "AchievementRewardCtoon" ("id", "rewardId", "ctoonId", "quantity")
SELECT gen_random_uuid()::text, "rewardId", "ctoonId", "quantity"
FROM "AchievementClaimOption"
WHERE "ctoonId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "AchievementClaimOption" DROP CONSTRAINT "AchievementClaimOption_ctoonId_fkey";

-- AlterTable: now safe to drop the old columns and require rewardId going forward.
ALTER TABLE "AchievementClaimOption" DROP COLUMN "ctoonId",
DROP COLUMN "points",
DROP COLUMN "quantity",
ALTER COLUMN "rewardId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CMoonRank_cMoonId_name_key" ON "CMoonRank"("cMoonId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonRank_cMoonId_sortOrder_key" ON "CMoonRank"("cMoonId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementClaimOption_rewardId_key" ON "AchievementClaimOption"("rewardId");

-- CreateIndex
CREATE INDEX "PointsLog_userId_direction_createdAt_idx" ON "PointsLog"("userId", "direction", "createdAt");

-- CreateIndex
CREATE INDEX "User_currentCMoonRankId_idx" ON "User"("currentCMoonRankId");

-- CreateIndex
CREATE INDEX "User_cMoonId_cMoonRankRoleGrantedAt_idx" ON "User"("cMoonId", "cMoonRankRoleGrantedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentCMoonRankId_fkey" FOREIGN KEY ("currentCMoonRankId") REFERENCES "CMoonRank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_cMoonRankId_fkey" FOREIGN KEY ("cMoonRankId") REFERENCES "CMoonRank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementClaimOption" ADD CONSTRAINT "AchievementClaimOption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "AchievementReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonRank" ADD CONSTRAINT "CMoonRank_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

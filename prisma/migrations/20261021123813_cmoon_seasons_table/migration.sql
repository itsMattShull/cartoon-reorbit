/*
  Warnings:

  - You are about to drop the `CMoonSeasonConfig` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `seasonId` to the `CMoonSeasonTracker` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "CMoonSeasonTracker_active_sortOrder_idx";

-- Deliberate, not a bug: the earlier single-current-season design had no per-season scoping for
-- trackers at all (a flat always-on list), so there is no correct seasonId to backfill onto any
-- existing row — an admin re-adds whatever trackers matter once they create their first season
-- under the new model. Clearing first lets the NOT NULL column below apply cleanly even if this
-- table already has rows in a deployed environment, instead of failing the deploy.
DELETE FROM "CMoonSeasonTracker";

-- AlterTable
ALTER TABLE "CMoonSeasonTracker" ADD COLUMN     "seasonId" TEXT NOT NULL;

-- DropTable
DROP TABLE "CMoonSeasonConfig";

-- CreateTable
CREATE TABLE "CMoonSeason" (
    "id" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "header" TEXT NOT NULL DEFAULT '',
    "blurb" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "enemiesDefeatedGoalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enemiesDefeatedGoalLabel" TEXT NOT NULL DEFAULT 'Enemies Defeated',
    "enemiesDefeatedGoalTarget" INTEGER NOT NULL DEFAULT 1000,
    "enemiesDefeatedGoalAnnouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonSeason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonSeason_seasonNumber_key" ON "CMoonSeason"("seasonNumber");

-- CreateIndex
CREATE INDEX "CMoonSeason_startAt_idx" ON "CMoonSeason"("startAt");

-- CreateIndex
CREATE INDEX "CMoonSeason_endAt_idx" ON "CMoonSeason"("endAt");

-- CreateIndex
CREATE INDEX "CMoonSeasonTracker_seasonId_active_sortOrder_idx" ON "CMoonSeasonTracker"("seasonId", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "CMoonSeasonTracker" ADD CONSTRAINT "CMoonSeasonTracker_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "CMoonSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

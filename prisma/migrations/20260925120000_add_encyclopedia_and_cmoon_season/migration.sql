
-- CreateEnum
CREATE TYPE "CMoonSeasonTrackerMetric" AS ENUM ('BATTLE_WINS', 'BATTLE_LOSSES', 'TEAM_SCORE', 'AVG_POINTS');

-- CreateTable
CREATE TABLE "EncyclopediaEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "heroImagePath" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncyclopediaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonSeasonConfig" (
    "id" TEXT NOT NULL,
    "header" TEXT NOT NULL DEFAULT 'cMoons Season 1',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blurb" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonSeasonConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonSeasonTracker" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metricType" "CMoonSeasonTrackerMetric" NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonSeasonTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EncyclopediaEntry_slug_key" ON "EncyclopediaEntry"("slug");

-- CreateIndex
CREATE INDEX "EncyclopediaEntry_active_sortOrder_idx" ON "EncyclopediaEntry"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "CMoonSeasonTracker_active_sortOrder_idx" ON "CMoonSeasonTracker"("active", "sortOrder");


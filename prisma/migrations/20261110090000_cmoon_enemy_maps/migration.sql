-- CreateEnum
CREATE TYPE "CMoonEnemyMapAnimation" AS ENUM ('GLOW', 'SMOKE', 'GLITTER', 'STATIC_COLOR');

-- CreateTable
CREATE TABLE "CMoonEnemyMap" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "isBaseMap" BOOLEAN NOT NULL DEFAULT false,
    "backgroundAnimation" "CMoonEnemyMapAnimation" NOT NULL DEFAULT 'STATIC_COLOR',
    "backgroundColor" TEXT NOT NULL DEFAULT '#000000',
    "occurrenceWeight" INTEGER NOT NULL DEFAULT 50,
    "assignedEnemiesOnly" BOOLEAN NOT NULL DEFAULT false,
    "specialThresholdReduction" INTEGER NOT NULL DEFAULT 0,
    "poisonAmount" INTEGER NOT NULL DEFAULT 0,
    "poisonIntervalRounds" INTEGER NOT NULL DEFAULT 0,
    "poisonAffectsPlayers" BOOLEAN NOT NULL DEFAULT true,
    "poisonAffectsEnemies" BOOLEAN NOT NULL DEFAULT true,
    "healAmount" INTEGER NOT NULL DEFAULT 0,
    "healIntervalRounds" INTEGER NOT NULL DEFAULT 0,
    "healAffectsPlayers" BOOLEAN NOT NULL DEFAULT true,
    "healAffectsEnemies" BOOLEAN NOT NULL DEFAULT true,
    "fogOfWarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyMap_name_key" ON "CMoonEnemyMap"("name");

-- CreateIndex
CREATE INDEX "CMoonEnemyMap_active_assignedEnemiesOnly_idx" ON "CMoonEnemyMap"("active", "assignedEnemiesOnly");

-- AlterTable
ALTER TABLE "CMoonEnemyFaction" ADD COLUMN "defaultMapId" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN "overrideMapId" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyRaid" ADD COLUMN "mapId" TEXT;

-- AlterTable
ALTER TABLE "CMoonPvpMatch" ADD COLUMN "mapId" TEXT;

-- AddForeignKey
ALTER TABLE "CMoonEnemyFaction" ADD CONSTRAINT "CMoonEnemyFaction_defaultMapId_fkey" FOREIGN KEY ("defaultMapId") REFERENCES "CMoonEnemyMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyMember" ADD CONSTRAINT "CMoonEnemyMember_overrideMapId_fkey" FOREIGN KEY ("overrideMapId") REFERENCES "CMoonEnemyMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyRaid" ADD CONSTRAINT "CMoonEnemyRaid_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "CMoonEnemyMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpMatch" ADD CONSTRAINT "CMoonPvpMatch_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "CMoonEnemyMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the base "No Effect" map — the pre-existing baseline this feature ships with, not an
-- admin-created map, so it starts active (every other map starts inactive). Every effect
-- column is left at its off/zero default; backgroundColor '#000000' with STATIC_COLOR renders
-- no visible overlay.
INSERT INTO "CMoonEnemyMap" (id, name, active, "isBaseMap", "backgroundAnimation", "backgroundColor", "occurrenceWeight", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'No Effect', true, true, 'STATIC_COLOR', '#000000', 50, now(), now());

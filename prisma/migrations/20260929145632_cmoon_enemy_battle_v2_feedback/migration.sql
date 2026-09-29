-- AlterEnum
ALTER TYPE "CMoonEnemyRewardType" ADD VALUE 'POINTS';

-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "cmoonMonstersDefeatedGte" INTEGER;

-- AlterTable
ALTER TABLE "CMoonEnemyFaction" ADD COLUMN     "battleMusicPath" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "critChanceAgainstPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "critChanceFromPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonEnemySlayerBoardEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cMoonEnemySlayerFirstPlacePoints" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "cMoonEnemySlayerTop10Points" INTEGER NOT NULL DEFAULT 50;

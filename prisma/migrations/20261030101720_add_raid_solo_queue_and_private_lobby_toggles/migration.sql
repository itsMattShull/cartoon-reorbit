-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonRaidPrivateLobbiesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cMoonRaidSoloQueueEnabled" BOOLEAN NOT NULL DEFAULT true;

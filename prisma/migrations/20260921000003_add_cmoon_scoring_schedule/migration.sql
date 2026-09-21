-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN "cMoonScoringRunHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cMoonScoringRunMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cMoonScoringLastRunDate" TEXT;

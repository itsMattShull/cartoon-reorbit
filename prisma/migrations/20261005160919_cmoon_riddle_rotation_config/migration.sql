-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonRiddleLastPostedFor" TEXT,
ADD COLUMN     "cMoonRiddleRotationDayOfWeek" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cMoonRiddleRotationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonRiddleRotationHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "cMoonRiddleRotationMinute" INTEGER NOT NULL DEFAULT 0;

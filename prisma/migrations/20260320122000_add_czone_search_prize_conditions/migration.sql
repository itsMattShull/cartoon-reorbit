CREATE TYPE "CZoneSearchTimeOfDay" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT');

ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionDateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionDateStart" TEXT;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionDateEnd" TEXT;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionTimeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionTimeOfDay" "CZoneSearchTimeOfDay";
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionBackgroundEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionBackgrounds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionCtoonInZoneEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionCtoonInZoneId" TEXT;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserOwnsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserOwns" JSONB;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserPointsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserPointsMin" INTEGER;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserTotalCountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserTotalCountMin" INTEGER;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserUniqueCountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "conditionUserUniqueCountMin" INTEGER;

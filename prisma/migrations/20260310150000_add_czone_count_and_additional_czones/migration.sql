-- Add global cZone count and per-user extra zones.
ALTER TABLE "GlobalGameConfig" ADD COLUMN "czoneCount" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "User" ADD COLUMN "additionalCzones" INTEGER NOT NULL DEFAULT 0;

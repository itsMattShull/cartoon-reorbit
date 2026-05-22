-- AlterTable: Add glitchEffect flag to CZoneSearchPrize for Matrix/TV glitch effect on cZone search
ALTER TABLE "CZoneSearchPrize" ADD COLUMN "glitchEffect" BOOLEAN NOT NULL DEFAULT false;

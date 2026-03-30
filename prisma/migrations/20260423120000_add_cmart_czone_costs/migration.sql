-- Add cMart cZone upgrade cost fields to GlobalGameConfig
ALTER TABLE "GlobalGameConfig" ADD COLUMN "firstAdditionalCzoneCost" INTEGER NOT NULL DEFAULT 25000;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "subsequentAdditionalCzoneCost" INTEGER NOT NULL DEFAULT 50000;

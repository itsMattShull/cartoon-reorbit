-- Add pack price decay configuration fields to GlobalGameConfig
ALTER TABLE "GlobalGameConfig" ADD COLUMN "packPriceDecayAmount" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "packPriceDecayDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "packPriceFloor" INTEGER NOT NULL DEFAULT 700;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "packMaxDefaultBuysPerUser" INTEGER NOT NULL DEFAULT 5;

-- Add total max buys per user to Pack
ALTER TABLE "Pack" ADD COLUMN "maxBuysPerUser" INTEGER;

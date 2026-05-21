-- AlterTable: Add time-based purchase limit override fields to Ctoon
ALTER TABLE "Ctoon" ADD COLUMN "timeBasedLimitCount" INTEGER;
ALTER TABLE "Ctoon" ADD COLUMN "timeBasedLimitWindowDays" INTEGER;

-- AlterTable: Add per-rarity time-based purchase limits defaults to GlobalGameConfig
ALTER TABLE "GlobalGameConfig" ADD COLUMN "timeBasedPurchaseLimits" JSONB;

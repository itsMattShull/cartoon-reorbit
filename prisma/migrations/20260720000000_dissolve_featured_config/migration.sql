-- AlterTable
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN "featuredDissolveRarities" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "featuredDissolveSeries" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "featuredDissolveSets" JSONB NOT NULL DEFAULT '[]';

-- Backfill: preserve current hardcoded behavior (Pokemon series + Crazy Rare
-- rarity were the only two "featured" triggers before this migration).
UPDATE "GlobalGameConfig"
SET "featuredDissolveRarities" = '["Crazy Rare"]',
    "featuredDissolveSeries" = '["Pokemon"]'
WHERE "id" = 'singleton';

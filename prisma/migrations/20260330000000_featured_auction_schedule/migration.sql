-- AlterTable: replace featuredAuctionsPerDay with flexible hourly schedule fields
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN "featuredAuctionHours"         JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN "featuredAuctionIntervalDays"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "featuredAuctionsPerSlot"      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "featuredAuctionLastFiredSlot" TEXT;

ALTER TABLE "GlobalGameConfig"
  DROP COLUMN "featuredAuctionsPerDay";

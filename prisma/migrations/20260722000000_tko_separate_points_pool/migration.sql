-- Separate TKO points from the general daily game points pool
ALTER TABLE "GamePointLog"
  ADD COLUMN IF NOT EXISTS "gameName" TEXT;

ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "tkoDailyPointLimit" INTEGER NOT NULL DEFAULT 250;

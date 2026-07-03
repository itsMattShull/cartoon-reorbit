-- AlterTable: add game tile image path columns to GlobalGameConfig
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileWinballImagePath"      TEXT;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileLottoImagePath"        TEXT;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileWinwheelImagePath"     TEXT;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileClashImagePath"        TEXT;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileTkoImagePath"          TEXT;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileReorbitmatchImagePath" TEXT;

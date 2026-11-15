-- Admin-toggleable weekly (last-7-days) ranking windows for the arcade-game High Score/Top 10
-- board and the Solo Enemy Slayer board (default off, preserving current all-time behavior), plus
-- a flat cMoon-points-per-win amount for OG gToons PvP matches (default 0, awards nothing).
ALTER TABLE "GlobalGameConfig" ADD COLUMN "cMoonGamesWeeklyScoringEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "cMoonEnemySlayerWeeklyScoringEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "cMoonOgGtoonsWinPoints" INTEGER NOT NULL DEFAULT 0;

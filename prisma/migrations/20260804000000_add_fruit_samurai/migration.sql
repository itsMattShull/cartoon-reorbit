-- Fruit Samurai
--
-- Adds the per-game tuning columns, the Games-page tile slot, and the score/play tables.
-- Written idempotently (IF NOT EXISTS everywhere) to match the house style of
-- 20260803100000_add_ed_edd_eddy_rps and 20260802000000_add_reorbit_blackjack.

-- ── GameConfig tuning ────────────────────────────────────────────────────────────
-- Bounds are enforced by normalizeConfig() in lib/fruitSamuraiSim.js on every read — including
-- on the way out of the Redis session — so these defaults are a starting point rather than a
-- constraint. Note there is deliberately no slow-motion factor for the physics: the hourglass
-- power-up is a renderer pacing effect and never enters the simulation.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiRankedPlaysPerPeriod" INTEGER DEFAULT 3;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPointsPerGame"        INTEGER DEFAULT 50;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiStartingLives"        INTEGER DEFAULT 3;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiGravity"              INTEGER DEFAULT 70;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiLaunchVyMin"          INTEGER DEFAULT 4000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiLaunchVyMax"          INTEGER DEFAULT 4900;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiLaunchVxMax"          INTEGER DEFAULT 500;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiGraceTicks"           INTEGER DEFAULT 90;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiSpawnIntervalStart"   INTEGER DEFAULT 150;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiSpawnIntervalMin"     INTEGER DEFAULT 60;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiRampTicks"            INTEGER DEFAULT 9000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiWaveTwoTicks"         INTEGER DEFAULT 2400;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiWaveThreeTicks"       INTEGER DEFAULT 6000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiEscalationStart"      INTEGER DEFAULT 9000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiEscalationTicks"      INTEGER DEFAULT 1500;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiSpeedStartPct"        INTEGER DEFAULT 100;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiSpeedMaxPct"          INTEGER DEFAULT 128;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiJitterTicks"          INTEGER DEFAULT 20;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPowerupInterval"      INTEGER DEFAULT 900;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPowerupChancePct"     INTEGER DEFAULT 55;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiWeightPiggy"          INTEGER DEFAULT 40;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiWeightHourglass"      INTEGER DEFAULT 35;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiWeightDynamite"       INTEGER DEFAULT 25;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPowerupRadius"        INTEGER DEFAULT 22;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPowerupSpeedPct"      INTEGER DEFAULT 85;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPiggyMultiplier"      INTEGER DEFAULT 2;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiPiggyTicks"           INTEGER DEFAULT 480;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiHourglassScalePct"    INTEGER DEFAULT 45;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiHourglassTicks"       INTEGER DEFAULT 240;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiDynamiteFuseTicks"    INTEGER DEFAULT 36;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiDynamiteMultiplier"   INTEGER DEFAULT 3;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiDynamiteMaxTargets"   INTEGER DEFAULT 24;

-- Jack's commentary. Only the cadence is configurable; the line pool lives in the client, so
-- there is no admin-authored text to store or render.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiJackChatterEnabled"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiJackChatterCooldown" INTEGER DEFAULT 420;

ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiJackImagePath"       TEXT;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "fruitSamuraiBackgroundImagePath" TEXT;

-- ── Games-page tile ──────────────────────────────────────────────────────────────
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileFruitsamuraiImagePath" TEXT;

-- ── Score and play tables ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FruitSamuraiScore" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "score"     INTEGER NOT NULL,
  "ticks"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FruitSamuraiScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FruitSamuraiPlay" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "ranked"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FruitSamuraiPlay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FruitSamuraiScore_userId_score_idx" ON "FruitSamuraiScore" ("userId", "score");
-- Covering index for the leaderboard: getGameLeaderboard filters on createdAt for the weekly
-- and monthly boards, then groups by user and takes MAX(score).
CREATE INDEX IF NOT EXISTS "FruitSamuraiScore_createdAt_userId_score_idx" ON "FruitSamuraiScore" ("createdAt", "userId", "score");
CREATE INDEX IF NOT EXISTS "FruitSamuraiPlay_userId_ranked_createdAt_idx" ON "FruitSamuraiPlay" ("userId", "ranked", "createdAt");

DO $$
BEGIN
  ALTER TABLE "FruitSamuraiScore"
    ADD CONSTRAINT "FruitSamuraiScore_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FruitSamuraiPlay"
    ADD CONSTRAINT "FruitSamuraiPlay_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

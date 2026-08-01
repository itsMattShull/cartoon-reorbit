-- Operation A.S.T.E.R.O.I.D.
-- Adds the game's admin-tunable settings to GameConfig, its Games-Home tile slot to
-- GlobalGameConfig, and the score/ranked-play tables.

-- GameConfig: game settings. Defaults mirror DEFAULT_CONFIG in utils/asteroidSim.js.
ALTER TABLE "GameConfig"
  ADD COLUMN "asteroidRankedPlaysPerPeriod" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "asteroidPointsPerGame"        INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "asteroidStartingLives"        INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "asteroidStartAsteroids"       INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "asteroidAsteroidsPerWave"     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "asteroidAsteroidSpeed"        DOUBLE PRECISION NOT NULL DEFAULT 1.15,
  ADD COLUMN "asteroidWaveSpeedGrowth"      DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  ADD COLUMN "asteroidMaxSpeedMultiplier"   DOUBLE PRECISION NOT NULL DEFAULT 2.2,
  ADD COLUMN "asteroidTurnRate"             INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "asteroidThrustAccel"          DOUBLE PRECISION NOT NULL DEFAULT 0.145,
  ADD COLUMN "asteroidMaxShipSpeed"         DOUBLE PRECISION NOT NULL DEFAULT 5.6,
  ADD COLUMN "asteroidShipDrag"             DOUBLE PRECISION NOT NULL DEFAULT 0.992,
  ADD COLUMN "asteroidFireIntervalTicks"    INTEGER NOT NULL DEFAULT 13,
  ADD COLUMN "asteroidExtraLifeScore"       INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "asteroidPointsLarge"          INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "asteroidPointsMedium"         INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "asteroidPointsSmall"          INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "asteroidWaveClearBonus"       INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN "asteroidPowerupsEnabled"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asteroidPowerupBlueEnabled"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asteroidPowerupRedEnabled"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asteroidPowerupGreenEnabled"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asteroidPowerupIntervalTicks" INTEGER NOT NULL DEFAULT 900,
  ADD COLUMN "asteroidPowerupChancePercent" INTEGER NOT NULL DEFAULT 65,
  ADD COLUMN "asteroidPowerupBlueTicks"     INTEGER NOT NULL DEFAULT 600,
  ADD COLUMN "asteroidPowerupRedTicks"      INTEGER NOT NULL DEFAULT 420,
  ADD COLUMN "asteroidPowerupGreenTicks"    INTEGER NOT NULL DEFAULT 720;

-- GlobalGameConfig: Games Home tile image.
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN "gameTileAsteroidImagePath" TEXT;

-- Scores. Only ranked runs land here.
CREATE TABLE "AsteroidScore" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "score"     INTEGER NOT NULL,
  "wave"      INTEGER NOT NULL DEFAULT 1,
  "ticks"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AsteroidScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AsteroidScore_userId_score_idx"     ON "AsteroidScore"("userId", "score");
CREATE INDEX "AsteroidScore_createdAt_idx"        ON "AsteroidScore"("createdAt");
CREATE INDEX "AsteroidScore_userId_createdAt_idx" ON "AsteroidScore"("userId", "createdAt");

ALTER TABLE "AsteroidScore"
  ADD CONSTRAINT "AsteroidScore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ranked-play ledger. A row is written only when a ranked slot is consumed, so unlimited
-- unranked practice runs never touch this table.
CREATE TABLE "AsteroidPlay" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AsteroidPlay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AsteroidPlay_userId_createdAt_idx" ON "AsteroidPlay"("userId", "createdAt");

ALTER TABLE "AsteroidPlay"
  ADD CONSTRAINT "AsteroidPlay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

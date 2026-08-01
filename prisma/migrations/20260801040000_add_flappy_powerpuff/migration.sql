-- AddField: Flappy Powerpuff settings on GameConfig
-- Values are in world units (the game runs in a fixed 480x760 world, letterboxed into the
-- player's viewport). Engine-side hard bounds live in server/utils/flappyPowerpuffEngine.js.
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "flappyPlaysPerPeriod"     INTEGER          NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "flappyPointsPerGame"      INTEGER          NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "flappyGravity"            DOUBLE PRECISION NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS "flappyFlapVelocity"       DOUBLE PRECISION NOT NULL DEFAULT -440,
  ADD COLUMN IF NOT EXISTS "flappyScrollSpeed"        DOUBLE PRECISION NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "flappyPipeGap"            DOUBLE PRECISION NOT NULL DEFAULT 215,
  ADD COLUMN IF NOT EXISTS "flappyPipeSpacing"        DOUBLE PRECISION NOT NULL DEFAULT 330,
  ADD COLUMN IF NOT EXISTS "flappySpeedGrowthPerPipe" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS "flappyMaxSpeedMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "flappyMaxScore"           INTEGER          NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "flappyMaxSessionSeconds"  INTEGER          NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS "flappyBlossomImagePath"   TEXT,
  ADD COLUMN IF NOT EXISTS "flappyBubblesImagePath"   TEXT,
  ADD COLUMN IF NOT EXISTS "flappyButtercupImagePath" TEXT,
  ADD COLUMN IF NOT EXISTS "flappyCityImagePath"      TEXT;

-- AddField: Flappy Powerpuff tile image on GlobalGameConfig
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "gameTileFlappyImagePath" TEXT;

-- AddField: Flappy Powerpuff high-score achievement criterion
ALTER TABLE "Achievement"
  ADD COLUMN IF NOT EXISTS "flappyBestScoreGte" INTEGER;

-- CreateTable: FlappyPowerpuffScore
CREATE TABLE IF NOT EXISTS "FlappyPowerpuffScore" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "score"     INTEGER      NOT NULL,
  "character" TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlappyPowerpuffScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FlappyPowerpuffPlay
-- `ranked` is false for the unlimited free-play runs allowed after the daily allotment is
-- spent. Those rows are still written so the game stays visible to play analytics; only
-- ranked rows count against the allotment.
CREATE TABLE IF NOT EXISTS "FlappyPowerpuffPlay" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "ranked"    BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlappyPowerpuffPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The createdAt index is deliberately covering: the leaderboard's weekly/monthly period
-- filters and the global week-high aggregate both read userId and score for every row in the
-- range, so a bare createdAt index would heap-fetch each one.
CREATE INDEX IF NOT EXISTS "FlappyPowerpuffScore_userId_score_idx"
  ON "FlappyPowerpuffScore"("userId", "score");
CREATE INDEX IF NOT EXISTS "FlappyPowerpuffScore_createdAt_userId_score_idx"
  ON "FlappyPowerpuffScore"("createdAt", "userId", "score");
CREATE INDEX IF NOT EXISTS "FlappyPowerpuffPlay_userId_ranked_createdAt_idx"
  ON "FlappyPowerpuffPlay"("userId", "ranked", "createdAt");

-- AddForeignKey
ALTER TABLE "FlappyPowerpuffScore" ADD CONSTRAINT "FlappyPowerpuffScore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FlappyPowerpuffPlay" ADD CONSTRAINT "FlappyPowerpuffPlay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddField: Tower Stack settings on GameConfig
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "towerPlaysPerPeriod"      INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "towerPointsPerGame"       INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "towerBaseSpeed"           DOUBLE PRECISION NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "towerSpeedGrowthPerLayer" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS "towerMaxSpeedMultiplier"  DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS "towerPerfectEpsilon"       DOUBLE PRECISION NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "towerMaxLayers"            INTEGER NOT NULL DEFAULT 800;

-- AddField: Tower Stack tile image on GlobalGameConfig
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "gameTileTowerImagePath" TEXT;

-- CreateTable: TowerStackScore
CREATE TABLE IF NOT EXISTS "TowerStackScore" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "score"     INTEGER      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TowerStackScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TowerStackPlay
CREATE TABLE IF NOT EXISTS "TowerStackPlay" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TowerStackPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TowerStackScore_userId_score_idx"    ON "TowerStackScore"("userId", "score");
CREATE INDEX IF NOT EXISTS "TowerStackScore_createdAt_idx"        ON "TowerStackScore"("createdAt");
CREATE INDEX IF NOT EXISTS "TowerStackScore_userId_createdAt_idx" ON "TowerStackScore"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TowerStackPlay_userId_createdAt_idx"  ON "TowerStackPlay"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TowerStackScore" ADD CONSTRAINT "TowerStackScore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TowerStackPlay" ADD CONSTRAINT "TowerStackPlay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

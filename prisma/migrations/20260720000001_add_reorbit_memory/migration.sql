-- AddField: ReOrbit Memory settings on GameConfig
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "reorbitMemoryPlaysPerPeriod"    INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "reorbitMemoryPointsPerGame"     INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "reorbitMemoryPairs"             INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "reorbitMemoryTimeSeconds"       INTEGER,
  ADD COLUMN IF NOT EXISTS "reorbitMemoryFlipBackDelayMs"   INTEGER NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS "reorbitMemoryCardBackImagePath" TEXT;

-- AddField: ReOrbit Memory tile image on GlobalGameConfig
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "gameTileReorbitmemoryImagePath" TEXT;

-- CreateTable: ReOrbitMemoryScore
CREATE TABLE IF NOT EXISTS "ReOrbitMemoryScore" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "moves"     INTEGER      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReOrbitMemoryScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReOrbitMemoryPlay
CREATE TABLE IF NOT EXISTS "ReOrbitMemoryPlay" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReOrbitMemoryPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReOrbitMemoryScore_userId_moves_idx"     ON "ReOrbitMemoryScore"("userId", "moves");
CREATE INDEX IF NOT EXISTS "ReOrbitMemoryScore_createdAt_idx"         ON "ReOrbitMemoryScore"("createdAt");
CREATE INDEX IF NOT EXISTS "ReOrbitMemoryScore_userId_createdAt_idx"  ON "ReOrbitMemoryScore"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReOrbitMemoryPlay_userId_createdAt_idx"   ON "ReOrbitMemoryPlay"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReOrbitMemoryScore" ADD CONSTRAINT "ReOrbitMemoryScore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReOrbitMemoryPlay" ADD CONSTRAINT "ReOrbitMemoryPlay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddField: ReOrbit Match settings on GameConfig
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "reorbitPlaysPerPeriod" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "reorbitPointsPerGame"  INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "reorbitTimeSeconds"    INTEGER,
  ADD COLUMN IF NOT EXISTS "reorbitEmojis"         TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "reorbitGridSize"        INTEGER NOT NULL DEFAULT 8;

-- CreateTable: ReOrbitMatchScore
CREATE TABLE IF NOT EXISTS "ReOrbitMatchScore" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "score"     INTEGER      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReOrbitMatchScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReOrbitMatchPlay
CREATE TABLE IF NOT EXISTS "ReOrbitMatchPlay" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReOrbitMatchPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReOrbitMatchScore_userId_score_idx"   ON "ReOrbitMatchScore"("userId", "score");
CREATE INDEX IF NOT EXISTS "ReOrbitMatchScore_createdAt_idx"       ON "ReOrbitMatchScore"("createdAt");
CREATE INDEX IF NOT EXISTS "ReOrbitMatchScore_userId_createdAt_idx" ON "ReOrbitMatchScore"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReOrbitMatchPlay_userId_createdAt_idx" ON "ReOrbitMatchPlay"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReOrbitMatchScore" ADD CONSTRAINT "ReOrbitMatchScore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReOrbitMatchPlay" ADD CONSTRAINT "ReOrbitMatchPlay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

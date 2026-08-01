-- AddField: "Guess that cToon!" settings on GameConfig
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "guessCtoonPlaysPerPeriod"     INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "guessCtoonPointsPerGame"      INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "guessCtoonSecondsPerQuestion" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "guessCtoonChoices"            INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "guessCtoonMaxQuestions"       INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS "guessCtoonMinStreakForPoints" INTEGER NOT NULL DEFAULT 3;

-- AddField: Guess that cToon tile image on GlobalGameConfig
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "gameTileGuessctoonImagePath" TEXT;

-- AddField: per-cToon opt-out from the Guess that cToon answer pool
ALTER TABLE "Ctoon"
  ADD COLUMN IF NOT EXISTS "guessCtoonExcluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: GuessCtoonScore
CREATE TABLE IF NOT EXISTS "GuessCtoonScore" (
  "id"             TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "streak"         INTEGER      NOT NULL,
  "suspicious"     BOOLEAN      NOT NULL DEFAULT false,
  "medianAnswerMs" INTEGER,
  "stdDevAnswerMs" INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuessCtoonScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GuessCtoonPlay
CREATE TABLE IF NOT EXISTS "GuessCtoonPlay" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuessCtoonPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuessCtoonScore_userId_streak_idx"            ON "GuessCtoonScore"("userId", "streak");
CREATE INDEX IF NOT EXISTS "GuessCtoonScore_createdAt_userId_streak_idx"  ON "GuessCtoonScore"("createdAt", "userId", "streak");
CREATE INDEX IF NOT EXISTS "GuessCtoonPlay_userId_createdAt_idx"          ON "GuessCtoonPlay"("userId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuessCtoonScore_userId_fkey') THEN
    ALTER TABLE "GuessCtoonScore" ADD CONSTRAINT "GuessCtoonScore_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuessCtoonPlay_userId_fkey') THEN
    ALTER TABLE "GuessCtoonPlay" ADD CONSTRAINT "GuessCtoonPlay_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Seed the GameConfig row so the column defaults above actually materialize.
-- Unlike the other mini-games, this one has no admin tab to lazily create its row
-- (see server/api/admin/game-config.get.js), so without this INSERT every setting
-- would live only as a JS fallback and the columns would be unreachable.
INSERT INTO "GameConfig" ("id", "gameName")
VALUES (gen_random_uuid()::text, 'GuessCtoon')
ON CONFLICT ("gameName") DO NOTHING;

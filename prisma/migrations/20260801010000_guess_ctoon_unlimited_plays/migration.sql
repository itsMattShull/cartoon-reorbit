-- Guess that cToon!: unlimited plays, with a per-day cap on how many COUNT.
--
-- Replaces the old hard play limit. Plays are no longer rationed; what is rationed is how
-- many runs per day earn points and are eligible for the leaderboard. Runs past that cap
-- stay playable as practice and are still recorded, so a player keeps their history.

-- The old column capped total plays per day; the new one caps SCORING plays per day.
-- Carry the existing value over where an environment already has it configured.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'GameConfig' AND column_name = 'guessCtoonPlaysPerPeriod'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'GameConfig' AND column_name = 'guessCtoonScoredPlaysPerPeriod'
  ) THEN
    ALTER TABLE "GameConfig" RENAME COLUMN "guessCtoonPlaysPerPeriod" TO "guessCtoonScoredPlaysPerPeriod";
  END IF;
END $$;

-- Covers a database that never had the original column (fresh install ordering).
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "guessCtoonScoredPlaysPerPeriod" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "GameConfig"
  DROP COLUMN IF EXISTS "guessCtoonPlaysPerPeriod";

-- Whether a run counts is decided at /start and recorded on both the play and the score.
ALTER TABLE "GuessCtoonPlay"
  ADD COLUMN IF NOT EXISTS "counted" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "GuessCtoonScore"
  ADD COLUMN IF NOT EXISTS "counted" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuessCtoonScore_userId_counted_streak_idx"   ON "GuessCtoonScore"("userId", "counted", "streak");
CREATE INDEX IF NOT EXISTS "GuessCtoonPlay_userId_counted_createdAt_idx" ON "GuessCtoonPlay"("userId", "counted", "createdAt");

-- OG gToons practice results: one lightweight row per FINISHED practice match, read by the
-- Practice Matches leaderboard. No deck data on purpose (practice must stay out of the Meta tab).
-- A brand-new table, so nothing existing is rewritten or locked.

-- CreateEnum
CREATE TYPE "OgGtoonPracticeDifficulty" AS ENUM ('easy', 'normal', 'hard');

-- CreateEnum
CREATE TYPE "OgGtoonPracticeOutcome" AS ENUM ('PLAYER_WIN', 'BOT_WIN', 'TIE');

-- CreateTable
CREATE TABLE "OgGtoonPracticeMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "difficulty" "OgGtoonPracticeDifficulty" NOT NULL,
    "outcome" "OgGtoonPracticeOutcome" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OgGtoonPracticeMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OgGtoonPracticeMatch_endedAt_idx" ON "OgGtoonPracticeMatch"("endedAt");

-- AddForeignKey
ALTER TABLE "OgGtoonPracticeMatch" ADD CONSTRAINT "OgGtoonPracticeMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

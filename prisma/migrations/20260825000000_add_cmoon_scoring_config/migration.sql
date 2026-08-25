-- AlterTable
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN     "cMoonHighScorePoints" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN     "cMoonTop10Points" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN     "cMoonDailyTaskPoints" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN     "cMoonScoringMinAccountAgeDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN     "cMoonTop10RankCutoff" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN     "cMoonTop10PointsBoardEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN     "cMoonTop10CtoonsBoardEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN     "cMoonDisabledScoreGames" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN     "cMoonDisabledWinGames" JSONB NOT NULL DEFAULT '[]';

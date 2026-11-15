-- OG gToons tournaments: async + live match play.
-- Purely additive: every new column is nullable or has a default, so rows that already exist (and the
-- tournament running right now) are untouched and keep the old both-online rules (asyncRules = false). Pairings created
-- after this ships are stamped asyncRules = true by the application.

-- Per-pairing async state.
ALTER TABLE "OgGtoonTournamentMatch"
  ADD COLUMN "asyncRules" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "baseDueAt" TIMESTAMP(3),
  ADD COLUMN "extensions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastPlayAt" TIMESTAMP(3),
  ADD COLUMN "lastPlayUserId" TEXT,
  ADD COLUMN "deckProblemSide" TEXT;

-- The game itself, while it is being played.
CREATE TYPE "OgGtoonTournamentGameStatus" AS ENUM ('ACTIVE', 'ENDED', 'CLOSED');

CREATE TABLE "OgGtoonTournamentGame" (
  "id" TEXT NOT NULL,
  "tournamentMatchId" TEXT NOT NULL,
  "gameNumber" INTEGER NOT NULL,
  "status" "OgGtoonTournamentGameStatus" NOT NULL DEFAULT 'ACTIVE',
  "state" JSONB NOT NULL,
  "reveals" JSONB NOT NULL DEFAULT '[]',
  "seenA" INTEGER NOT NULL DEFAULT 0,
  "seenB" INTEGER NOT NULL DEFAULT 0,
  "introSeenA" BOOLEAN NOT NULL DEFAULT false,
  "introSeenB" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastPlayAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "OgGtoonTournamentGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OgGtoonTournamentGame_tournamentMatchId_gameNumber_key"
  ON "OgGtoonTournamentGame"("tournamentMatchId", "gameNumber");
CREATE INDEX "OgGtoonTournamentGame_status_idx" ON "OgGtoonTournamentGame"("status");

-- At most ONE active game per pairing, as a database fact. This is what makes "create the next game" safe to
-- call from several places at once (a Start, a game ending, an admin action, the cron): the loser gets a
-- unique violation instead of a second game. Prisma's schema language cannot express a partial index.
CREATE UNIQUE INDEX "OgGtoonTournamentGame_one_active_idx"
  ON "OgGtoonTournamentGame"("tournamentMatchId") WHERE "status" = 'ACTIVE';

ALTER TABLE "OgGtoonTournamentGame"
  ADD CONSTRAINT "OgGtoonTournamentGame_tournamentMatchId_fkey"
  FOREIGN KEY ("tournamentMatchId") REFERENCES "OgGtoonTournamentMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

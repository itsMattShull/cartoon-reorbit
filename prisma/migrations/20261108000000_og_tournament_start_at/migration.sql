-- OG gToons tournaments get an explicit start time. Null (every existing tournament) keeps the old behaviour of
-- starting the moment opt-in closes; a value makes opt-in close first and pairings be made at startAt (or when an
-- admin presses Start).
ALTER TABLE "OgGtoonTournament" ADD COLUMN "startAt" TIMESTAMP(3);

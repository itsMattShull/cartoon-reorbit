-- ReOrbit Chess
--
-- Adds the per-game tuning columns, the Games-page tile slot, and the match table.
-- Written idempotently (IF NOT EXISTS everywhere) to match the house style of
-- 20260803100000_add_ed_edd_eddy_rps.

-- ── GameConfig tuning ────────────────────────────────────────────────────────────
-- Bounds are enforced by clampConfig() in lib/reorbitChess.js on every read, so these
-- defaults are a starting point rather than a constraint.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "reorbitChessInitialSeconds"      INTEGER DEFAULT 300;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "reorbitChessIncrementSeconds"    INTEGER DEFAULT 3;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "reorbitChessPairDailyAwardLimit" INTEGER DEFAULT 2;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "reorbitChessMinPliesForAward"    INTEGER DEFAULT 20;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "reorbitChessGraceSeconds"        INTEGER DEFAULT 45;

-- ── Games-page tile ──────────────────────────────────────────────────────────────
-- gameTile + the tile slot key capitalised ('reorbitchess'), NOT the gameName. Compare
-- gameTileReorbitmatchImagePath. The read endpoint and both admin endpoints name this exact
-- column; a different casing here is a column nothing reads.
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileReorbitchessImagePath" TEXT;

-- ── Match table ──────────────────────────────────────────────────────────────────
-- PvP only. AI games are played entirely in the browser and never reach this table: the
-- player columns are NOT NULL FKs to User with no bot account to point at, and the
-- leaderboard counts rows here.
CREATE TABLE IF NOT EXISTS "ReOrbitChessMatch" (
  "id"               TEXT NOT NULL,
  "roomId"           TEXT NOT NULL,
  "whiteUserId"      TEXT NOT NULL,
  "blackUserId"      TEXT NOT NULL,
  "result"           TEXT NOT NULL,
  "winnerUserId"     TEXT,
  "whoLeftUserId"    TEXT,
  "endReason"        TEXT NOT NULL,
  "plies"            INTEGER NOT NULL DEFAULT 0,
  "finalFen"         TEXT NOT NULL,
  "moves"            JSONB,
  "initialSeconds"   INTEGER NOT NULL,
  "incrementSeconds" INTEGER NOT NULL,
  "whiteMsLeft"      INTEGER NOT NULL DEFAULT 0,
  "blackMsLeft"      INTEGER NOT NULL DEFAULT 0,
  "whiteIp"          TEXT,
  "blackIp"          TEXT,
  "whiteVisitorId"   TEXT,
  "blackVisitorId"   TEXT,
  "sameIp"           BOOLEAN NOT NULL DEFAULT false,
  "sameVisitorId"    BOOLEAN NOT NULL DEFAULT false,
  "pointsAwarded"    INTEGER NOT NULL DEFAULT 0,
  "pointsAwardedAt"  TIMESTAMP(3),
  "awardedUserId"    TEXT,
  "suppressReason"   TEXT,
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"          TIMESTAMP(3),

  CONSTRAINT "ReOrbitChessMatch_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ReOrbitChessMatch" ADD CONSTRAINT "ReOrbitChessMatch_whiteUserId_fkey"
    FOREIGN KEY ("whiteUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReOrbitChessMatch" ADD CONSTRAINT "ReOrbitChessMatch_blackUserId_fkey"
    FOREIGN KEY ("blackUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReOrbitChessMatch" ADD CONSTRAINT "ReOrbitChessMatch_winnerUserId_fkey"
    FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReOrbitChessMatch" ADD CONSTRAINT "ReOrbitChessMatch_whoLeftUserId_fkey"
    FOREIGN KEY ("whoLeftUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes matching the @@index lines in schema.prisma.
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_startedAt_idx"             ON "ReOrbitChessMatch" ("startedAt");
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_endedAt_idx"               ON "ReOrbitChessMatch" ("endedAt");
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_whiteUserId_endedAt_idx"   ON "ReOrbitChessMatch" ("whiteUserId", "endedAt");
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_blackUserId_endedAt_idx"   ON "ReOrbitChessMatch" ("blackUserId", "endedAt");
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_winnerUserId_endedAt_idx"  ON "ReOrbitChessMatch" ("winnerUserId", "endedAt");

-- Partial indexes for the leaderboard, which only ever looks at finished matches. Prisma
-- cannot express these, so they live here and here only.
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_white_finished_idx"
  ON "ReOrbitChessMatch" ("whiteUserId", "endedAt") WHERE "endedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_black_finished_idx"
  ON "ReOrbitChessMatch" ("blackUserId", "endedAt") WHERE "endedAt" IS NOT NULL;

-- The per-pair daily award limit counts paid games between one unordered pair. Ordering the
-- ids inside the index expression lets that count use an index instead of a scan.
CREATE INDEX IF NOT EXISTS "ReOrbitChessMatch_pair_paid_idx"
  ON "ReOrbitChessMatch" (
    LEAST("whiteUserId", "blackUserId"),
    GREATEST("whiteUserId", "blackUserId"),
    "pointsAwardedAt"
  ) WHERE "pointsAwardedAt" IS NOT NULL;

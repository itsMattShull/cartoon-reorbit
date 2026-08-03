-- Ed, Edd n Eddy Rock Paper Scissors
--
-- Adds the per-game tuning columns, the Games-page tile slot, and the match table.
-- Written idempotently (IF NOT EXISTS everywhere) to match the house style of
-- 20260802000000_add_reorbit_blackjack.

-- ── GameConfig tuning ────────────────────────────────────────────────────────────
-- Bounds are enforced by clampConfig() in lib/edRps.js on every read, so these defaults are
-- a starting point rather than a constraint.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "edRpsRoundSeconds"        INTEGER DEFAULT 15;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "edRpsWinsNeeded"          INTEGER DEFAULT 4;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "edRpsMaxRounds"           INTEGER DEFAULT 7;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "edRpsPairDailyAwardLimit" INTEGER DEFAULT 2;

-- ── Games-page tile ──────────────────────────────────────────────────────────────
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileEdrpsImagePath" TEXT;

-- ── Match table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EdRpsMatch" (
  "id"               TEXT NOT NULL,
  "roomId"           TEXT NOT NULL,
  "player1UserId"    TEXT NOT NULL,
  "player2UserId"    TEXT NOT NULL,
  "player1Character" TEXT NOT NULL,
  "player2Character" TEXT NOT NULL,
  "player1Score"     INTEGER NOT NULL DEFAULT 0,
  "player2Score"     INTEGER NOT NULL DEFAULT 0,
  "winnerUserId"     TEXT,
  "whoLeftUserId"    TEXT,
  "endReason"        TEXT NOT NULL DEFAULT 'natural',
  "rounds"           JSONB,
  "player1Ip"        TEXT,
  "player2Ip"        TEXT,
  "player1VisitorId" TEXT,
  "player2VisitorId" TEXT,
  "sameIp"           BOOLEAN NOT NULL DEFAULT false,
  "sameVisitorId"    BOOLEAN NOT NULL DEFAULT false,
  "pointsAwarded"    INTEGER NOT NULL DEFAULT 0,
  "pointsAwardedAt"  TIMESTAMP(3),
  "awardedUserId"    TEXT,
  "suppressReason"   TEXT,
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"          TIMESTAMP(3),

  CONSTRAINT "EdRpsMatch_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "EdRpsMatch" ADD CONSTRAINT "EdRpsMatch_player1UserId_fkey"
    FOREIGN KEY ("player1UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EdRpsMatch" ADD CONSTRAINT "EdRpsMatch_player2UserId_fkey"
    FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EdRpsMatch" ADD CONSTRAINT "EdRpsMatch_winnerUserId_fkey"
    FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EdRpsMatch" ADD CONSTRAINT "EdRpsMatch_whoLeftUserId_fkey"
    FOREIGN KEY ("whoLeftUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes matching the @@index lines in schema.prisma.
CREATE INDEX IF NOT EXISTS "EdRpsMatch_startedAt_idx"              ON "EdRpsMatch" ("startedAt");
CREATE INDEX IF NOT EXISTS "EdRpsMatch_endedAt_idx"                ON "EdRpsMatch" ("endedAt");
CREATE INDEX IF NOT EXISTS "EdRpsMatch_player1UserId_endedAt_idx"  ON "EdRpsMatch" ("player1UserId", "endedAt");
CREATE INDEX IF NOT EXISTS "EdRpsMatch_player2UserId_endedAt_idx"  ON "EdRpsMatch" ("player2UserId", "endedAt");
CREATE INDEX IF NOT EXISTS "EdRpsMatch_winnerUserId_endedAt_idx"   ON "EdRpsMatch" ("winnerUserId", "endedAt");

-- Partial indexes for the leaderboard, which only ever looks at finished matches. Prisma
-- cannot express these, so they live here and here only.
CREATE INDEX IF NOT EXISTS "EdRpsMatch_p1_finished_idx"
  ON "EdRpsMatch" ("player1UserId", "endedAt") WHERE "endedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EdRpsMatch_p2_finished_idx"
  ON "EdRpsMatch" ("player2UserId", "endedAt") WHERE "endedAt" IS NOT NULL;

-- The per-pair daily award limit counts paid matches between one unordered pair. Ordering the
-- ids inside the index expression lets that count use an index instead of a scan.
CREATE INDEX IF NOT EXISTS "EdRpsMatch_pair_paid_idx"
  ON "EdRpsMatch" (
    LEAST("player1UserId", "player2UserId"),
    GREATEST("player1UserId", "player2UserId"),
    "pointsAwardedAt"
  ) WHERE "pointsAwardedAt" IS NOT NULL;

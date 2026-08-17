-- Pokemon: Fire, Water, Grass!
--
-- Adds the per-game tuning columns, the uploaded-asset map, the Games-page tile slot, the
-- match table and the cosmetic trainer roster. Written idempotently (IF NOT EXISTS everywhere)
-- to match the house style of 20260803100000_add_ed_edd_eddy_rps.

-- ── GameConfig tuning ────────────────────────────────────────────────────────────
-- Bounds are enforced by clampConfig() in lib/pokemonBattle.js on every read, so these
-- defaults are a starting point rather than a constraint. roundSeconds is lower than the RPS
-- game's 15 because this game's intermission is up to 4.2s rather than 2.6s -- it narrates the
-- round instead of flashing a banner.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "pokemonBattleRoundSeconds"        INTEGER DEFAULT 12;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "pokemonBattleWinsNeeded"          INTEGER DEFAULT 3;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "pokemonBattleMaxRounds"           INTEGER DEFAULT 9;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "pokemonBattlePairDailyAwardLimit" INTEGER DEFAULT 2;

-- Uploaded sprites, logo, backdrops and music as one { slot: { path, width, height } } map,
-- rather than eleven more columns on a table that already carries 256 -- several callers still
-- do a bare findUnique that ships every one of them.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "pokemonBattleAssets" JSONB;

-- ── Games-page tile ──────────────────────────────────────────────────────────────
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTilePokemonbattleImagePath" TEXT;

-- ── Match table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PokemonBattleMatch" (
  "id"               TEXT NOT NULL,
  "roomId"           TEXT NOT NULL,
  "player1UserId"    TEXT NOT NULL,
  "player2UserId"    TEXT NOT NULL,
  "player1Character" TEXT,
  "player2Character" TEXT,
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

  CONSTRAINT "PokemonBattleMatch_pkey" PRIMARY KEY ("id")
);

-- Push the round history out of line. Postgres only TOASTs a row once it exceeds ~2KB, so
-- without this the per-round JSON stays inline: at ~1.3KB of history the heap fits about four
-- rows per 8KB page, and every leaderboard scan drags all of that through shared_buffers even
-- though the board never reads the column. Lowering the target moves `rounds` to the TOAST
-- relation and takes the main row to a few hundred bytes -- roughly five times fewer pages per
-- scan. Prisma cannot express this, so it lives here.
ALTER TABLE "PokemonBattleMatch" SET (toast_tuple_target = 512);

DO $$ BEGIN
  ALTER TABLE "PokemonBattleMatch" ADD CONSTRAINT "PokemonBattleMatch_player1UserId_fkey"
    FOREIGN KEY ("player1UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PokemonBattleMatch" ADD CONSTRAINT "PokemonBattleMatch_player2UserId_fkey"
    FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PokemonBattleMatch" ADD CONSTRAINT "PokemonBattleMatch_winnerUserId_fkey"
    FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PokemonBattleMatch" ADD CONSTRAINT "PokemonBattleMatch_whoLeftUserId_fkey"
    FOREIGN KEY ("whoLeftUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes matching the @@index lines in schema.prisma.
CREATE INDEX IF NOT EXISTS "PokemonBattleMatch_startedAt_idx"
  ON "PokemonBattleMatch" ("startedAt");
CREATE INDEX IF NOT EXISTS "PokemonBattleMatch_winnerUserId_endedAt_idx"
  ON "PokemonBattleMatch" ("winnerUserId", "endedAt");
-- ON DELETE SET NULL with no index means the account-dissolve worker sequentially scans this
-- whole table once per deleted user. EdRpsMatch has this gap; this table does not.
CREATE INDEX IF NOT EXISTS "PokemonBattleMatch_whoLeftUserId_idx"
  ON "PokemonBattleMatch" ("whoLeftUserId");

-- Partial indexes for the leaderboard, which only ever looks at finished matches. Prisma
-- cannot express these. Deliberately NOT paired with plain (playerNUserId, endedAt) indexes:
-- the partial form is strictly narrower and supersedes them, and EdRpsMatch carries both.
CREATE INDEX IF NOT EXISTS "PokemonBattleMatch_p1_finished_idx"
  ON "PokemonBattleMatch" ("player1UserId", "endedAt") WHERE "endedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PokemonBattleMatch_p2_finished_idx"
  ON "PokemonBattleMatch" ("player2UserId", "endedAt") WHERE "endedAt" IS NOT NULL;

-- The per-pair daily award limit counts paid matches between one unordered pair, across every
-- duel game. Ordering the ids inside the index expression lets that count use an index instead
-- of a scan.
CREATE INDEX IF NOT EXISTS "PokemonBattleMatch_pair_paid_idx"
  ON "PokemonBattleMatch" (
    LEAST("player1UserId", "player2UserId"),
    GREATEST("player1UserId", "player2UserId"),
    "pointsAwardedAt"
  ) WHERE "pointsAwardedAt" IS NOT NULL;

-- ── Trainer roster ───────────────────────────────────────────────────────────────
-- Cosmetic only: the Pokemon are the moves, a trainer never touches a match outcome.
CREATE TABLE IF NOT EXISTS "PokemonBattleTrainer" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "imagePath" TEXT NOT NULL,
  "thumbPath" TEXT,
  "width"     INTEGER,
  "height"    INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PokemonBattleTrainer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PokemonBattleTrainer_active_sortOrder_idx"
  ON "PokemonBattleTrainer" ("active", "sortOrder");

-- ── Seed the config row ──────────────────────────────────────────────────────────
-- Mirrors prisma/seed.js so an existing database gets a playable game without a reseed. Every
-- other column carries a default.
INSERT INTO "GameConfig" ("id", "gameName", "pointsPerWin")
VALUES (gen_random_uuid()::text, 'PokemonBattle', 100)
ON CONFLICT ("gameName") DO NOTHING;

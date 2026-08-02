-- ReOrbit Blackjack
--
-- Adds the per-game tuning columns, the Games-page tile slot, and the single durable table
-- the game needs. Written idempotently (IF NOT EXISTS everywhere) to match the house style of
-- 20260801040000_add_flappy_powerpuff.

-- ── GameConfig tuning ────────────────────────────────────────────────────────────
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackDailyBuyInLimit"  INTEGER DEFAULT 1000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackDailyWinLimit"    INTEGER DEFAULT 3000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackMinBet"           INTEGER DEFAULT 10;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackMaxBet"           INTEGER DEFAULT 500;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackPracticeStack"    INTEGER DEFAULT 1000;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackDeckCount"        INTEGER DEFAULT 6;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackPayoutNum"        INTEGER DEFAULT 3;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackPayoutDen"        INTEGER DEFAULT 2;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackDealerHitsSoft17" BOOLEAN DEFAULT false;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackAllowDouble"      BOOLEAN DEFAULT true;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackAllowSplit"       BOOLEAN DEFAULT true;
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "blackjackAllowInsurance"   BOOLEAN DEFAULT true;

-- ── Games-page tile ──────────────────────────────────────────────────────────────
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileBlackjackImagePath" TEXT;

-- ── Session table ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "BlackjackMode" AS ENUM ('practice', 'gamble');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BlackjackSession" (
  "id"           TEXT            NOT NULL,
  "userId"       TEXT            NOT NULL,
  "mode"         "BlackjackMode" NOT NULL,
  "status"       TEXT            NOT NULL DEFAULT 'active',
  "chips"        INTEGER         NOT NULL DEFAULT 0,
  "wagered"      INTEGER         NOT NULL DEFAULT 0,
  "totalBuyIn"   INTEGER         NOT NULL DEFAULT 0,
  "cashedOut"    INTEGER         NOT NULL DEFAULT 0,
  "handPhase"    TEXT            NOT NULL DEFAULT 'idle',
  "version"      INTEGER         NOT NULL DEFAULT 0,
  "activeKey"    TEXT,
  "rules"        JSONB           NOT NULL,
  "windowStart"  TIMESTAMP(3)    NOT NULL,
  "lastActionAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "BlackjackSession_pkey" PRIMARY KEY ("id")
);

-- One live session per user, enforced by the database rather than by an expiring lock.
-- activeKey is "<userId>:<mode>" while active and NULL once the session closes, so closed
-- sessions never collide (NULLs are not equal to each other in a unique index).
CREATE UNIQUE INDEX IF NOT EXISTS "BlackjackSession_activeKey_key"
  ON "BlackjackSession"("activeKey");

-- Serves the daily buy-in / net-winnings aggregate.
CREATE INDEX IF NOT EXISTS "BlackjackSession_userId_createdAt_idx"
  ON "BlackjackSession"("userId", "createdAt");

-- Serves the stale-session sweeper, which filters on status without a userId.
CREATE INDEX IF NOT EXISTS "BlackjackSession_status_windowStart_idx"
  ON "BlackjackSession"("status", "windowStart");

DO $$ BEGIN
  ALTER TABLE "BlackjackSession"
    ADD CONSTRAINT "BlackjackSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A practice session must never touch points. Enforced here so that a handler bug cannot
-- persist the violation, rather than relying on every code path remembering to check.
DO $$ BEGIN
  ALTER TABLE "BlackjackSession"
    ADD CONSTRAINT "BlackjackSession_practice_is_free"
    CHECK ("mode" = 'gamble' OR ("totalBuyIn" = 0 AND "cashedOut" = 0));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Chips and escrow are never negative, and a cash-out can never exceed what came in plus
-- winnings. The first two are absolute; they turn an arithmetic bug into a failed transaction.
DO $$ BEGIN
  ALTER TABLE "BlackjackSession"
    ADD CONSTRAINT "BlackjackSession_non_negative"
    CHECK ("chips" >= 0 AND "wagered" >= 0 AND "totalBuyIn" >= 0 AND "cashedOut" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

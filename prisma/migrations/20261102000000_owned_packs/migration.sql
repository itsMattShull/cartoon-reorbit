-- Owned packs: sealed packs that players hold, receive from codes / OG gToons PvP wins, trade and auction.
--
-- Deploy order (see .github/workflows/deploy.yml): pm2 stop -> npm ci -> prisma migrate deploy -> build -> reload.
-- No old code runs against the new schema, so making Auction.userCtoonId nullable is safe here. Prisma wraps
-- a migration in one transaction, which is why nothing below is CREATE INDEX CONCURRENTLY — fine while the site
-- is stopped. After deploy, run:  VACUUM (ANALYZE) "UserPack";   (the backfill below rewrites every row)
--
-- Statement order matters: enums -> UserPack columns -> backfill -> indexes (after the backfill, so they are built
-- in one pass) -> Auction changes -> new tables.

-- ── Enums ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TYPE "PackSource" AS ENUM ('PURCHASE', 'CODE', 'OG_GTOONS_PVP');
CREATE TYPE "AuctionKind" AS ENUM ('CTOON', 'PACK');
CREATE TYPE "OgGtoonRewardStatus" AS ENUM ('AWARDED', 'CAPPED', 'SAME_PAIR', 'IDLE_OPPONENT', 'BANNED', 'OFF', 'SKIPPED');
-- The new value cannot be referenced anywhere in this migration (nothing below does).
ALTER TYPE "NotificationType" ADD VALUE 'PVP_PACK_WON';

-- ── UserPack: provenance + original buyer ─────────────────────────────────────────────────────────────────────
-- DEFAULT 'PURCHASE' is metadata-only on PG11+, and is correct for every legacy row: until now a UserPack could
-- only come from a cMart purchase.
ALTER TABLE "UserPack"
  ADD COLUMN "source" "PackSource" NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN "buyerId" TEXT,
  ADD COLUMN "sourceRef" TEXT,
  ADD COLUMN "sourceOrdinal" INTEGER;

-- Legacy packs were never tradable, so the current owner IS the original buyer.
UPDATE "UserPack" SET "buyerId" = "userId" WHERE "buyerId" IS NULL;

CREATE UNIQUE INDEX "UserPack_sourceRef_sourceOrdinal_key" ON "UserPack"("sourceRef", "sourceOrdinal");

-- Packs tab list + the lock-state pre-checks: a user's UNOPENED packs, newest first. Tiny partial index.
CREATE INDEX "UserPack_unopened_idx" ON "UserPack"("userId", "createdAt" DESC, "id") WHERE "opened" = false;
-- Purchase limits (maxBuysPerUser / dailyPurchaseLimit) count by ORIGINAL buyer, never by current owner.
CREATE INDEX "UserPack_buyer_idx" ON "UserPack"("buyerId", "packId", "createdAt") WHERE "buyerId" IS NOT NULL;
-- Pack analytics: opened-at range counts, which carry no userId.
CREATE INDEX "UserPack_pack_opened_idx" ON "UserPack"("packId", "openedAt") WHERE "opened";
-- mintedCtoons joins in analytics and the ownership investigator.
CREATE INDEX "UserCtoon_userPackId_idx" ON "UserCtoon"("userPackId");

-- ── Auction: sell a pack as well as a cToon ───────────────────────────────────────────────────────────────────
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_userCtoonId_fkey";

ALTER TABLE "Auction"
  ADD COLUMN "kind" "AuctionKind" NOT NULL DEFAULT 'CTOON',
  ADD COLUMN "userPackId" TEXT,
  ALTER COLUMN "userCtoonId" DROP NOT NULL;

-- RESTRICT (what the old NOT NULL relation implied), not SET NULL: nulling an item id would break the CHECK below.
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userCtoonId_fkey"
  FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userPackId_fkey"
  FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one item, matching `kind`. NOT VALID then VALIDATE keeps the table lock short on a big table.
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_kind_item_check" CHECK (
     ("kind" = 'CTOON' AND "userCtoonId" IS NOT NULL AND "userPackId" IS NULL)
  OR ("kind" = 'PACK'  AND "userPackId"  IS NOT NULL AND "userCtoonId" IS NULL)
) NOT VALID;
ALTER TABLE "Auction" VALIDATE CONSTRAINT "Auction_kind_item_check";

-- One pack cannot be up for auction twice at once. Twin of "Auction_active_userCtoonId_key"
-- (20260803000000_unique_active_auction_per_user_ctoon); see the reasoning there. A partial unique index is the only
-- thing that closes the check-then-insert race for every creation path. Also serves "is this pack in an active
-- auction" lookups, so no separate (userPackId, status) index is needed.
CREATE UNIQUE INDEX "Auction_active_userPackId_key" ON "Auction"("userPackId") WHERE "status" = 'ACTIVE' AND "userPackId" IS NOT NULL;

-- ── Pack audit trail ──────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "PackOwnerLog" (
    "id" TEXT NOT NULL,
    "userPackId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "userId" TEXT,
    "method" TEXT NOT NULL,
    "counterpartyUserId" TEXT,
    "counterpartyUsername" TEXT,
    "tradeOfferId" TEXT,
    "auctionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackOwnerLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackOwnerLog_userPackId_createdAt_idx" ON "PackOwnerLog"("userPackId", "createdAt");
CREATE INDEX "PackOwnerLog_userId_createdAt_idx" ON "PackOwnerLog"("userId", "createdAt");
ALTER TABLE "PackOwnerLog" ADD CONSTRAINT "PackOwnerLog_userPackId_fkey"
  FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing pack gets its PURCHASE row, so the history is complete from day one.
INSERT INTO "PackOwnerLog" ("id", "userPackId", "packId", "userId", "method", "createdAt")
SELECT gen_random_uuid()::text, up."id", up."packId", up."userId", 'PURCHASE', up."createdAt" FROM "UserPack" up;

-- ── Trading ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "TradeOfferPack" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "userPackId" TEXT NOT NULL,
    "role" "TradeOfferCtoonRole" NOT NULL,

    CONSTRAINT "TradeOfferPack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TradeOfferPack_tradeOfferId_userPackId_role_key" ON "TradeOfferPack"("tradeOfferId", "userPackId", "role");
CREATE INDEX "TradeOfferPack_userPackId_idx" ON "TradeOfferPack"("userPackId");
ALTER TABLE "TradeOfferPack" ADD CONSTRAINT "TradeOfferPack_tradeOfferId_fkey"
  FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeOfferPack" ADD CONSTRAINT "TradeOfferPack_userPackId_fkey"
  FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OG gToons PvP pack reward ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "GameConfig"
  ADD COLUMN "ogGtoonsWinPackId" TEXT,
  ADD COLUMN "ogGtoonsWinPackPerUserLimit" INTEGER;
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_ogGtoonsWinPackId_fkey"
  FOREIGN KEY ("ogGtoonsWinPackId") REFERENCES "Pack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OgGtoonMatch"
  ADD COLUMN "rewardStatus" "OgGtoonRewardStatus",
  ADD COLUMN "rewardCheckedAt" TIMESTAMP(3),
  ADD COLUMN "rewardWindowStart" TIMESTAMP(3),
  ADD COLUMN "player1ManualCommits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "player2ManualCommits" INTEGER NOT NULL DEFAULT 0;

-- Matches that finished before this feature existed must never be paid retroactively: mark them all as already
-- evaluated. (In-flight matches are in memory, not in this table, until they end.)
UPDATE "OgGtoonMatch" SET "rewardStatus" = 'SKIPPED', "rewardCheckedAt" = NOW();

-- The reconcile cron's work queue: finished matches nobody has evaluated yet. Stays tiny — rows leave it as soon as
-- the award runs.
CREATE INDEX "OgGtoonMatch_reward_unchecked_idx" ON "OgGtoonMatch"("endedAt") WHERE "rewardCheckedAt" IS NULL AND "endedAt" IS NOT NULL;

CREATE TABLE "OgGtoonPackAward" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "winnerUserId" TEXT NOT NULL,
    "loserUserId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "userPackId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OgGtoonPackAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OgGtoonPackAward_matchId_key" ON "OgGtoonPackAward"("matchId");
-- Directional: one pack per (winner, loser) per window. A beating B and B beating A may each earn one.
CREATE UNIQUE INDEX "OgGtoonPackAward_winnerUserId_loserUserId_windowStart_key" ON "OgGtoonPackAward"("winnerUserId", "loserUserId", "windowStart");
CREATE INDEX "OgGtoonPackAward_winnerUserId_windowStart_idx" ON "OgGtoonPackAward"("winnerUserId", "windowStart");
CREATE INDEX "OgGtoonPackAward_windowStart_createdAt_idx" ON "OgGtoonPackAward"("windowStart", "createdAt");
ALTER TABLE "OgGtoonPackAward" ADD CONSTRAINT "OgGtoonPackAward_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "OgGtoonMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OgGtoonPackAward" ADD CONSTRAINT "OgGtoonPackAward_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OgGtoonPackAward" ADD CONSTRAINT "OgGtoonPackAward_userPackId_fkey"
  FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

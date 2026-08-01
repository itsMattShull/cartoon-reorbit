-- Counter offers: replying to a trade offer with a revised one, instead of
-- forcing the recipient to reject and rebuild the trade by hand.

-- A counter points back at the offer it replaced. The countered offer is closed
-- out (status COUNTERED) in the same transaction that creates the counter, so an
-- offer can only ever be countered once. UNIQUE enforces that at the database
-- level, which is what stops two concurrent counters on the same original from
-- both succeeding — the application-level status guard alone cannot, because
-- both transactions can read status = 'PENDING' before either commits.
ALTER TABLE "TradeOffer" ADD COLUMN "counteredOfferId" TEXT;

CREATE UNIQUE INDEX "TradeOffer_counteredOfferId_key"
  ON "TradeOffer"("counteredOfferId");

-- SET NULL rather than CASCADE: prisma/nuke-user.js and the exploit-audit
-- scripts delete TradeOffer rows outright, and losing a counter because the
-- offer it replaced was purged would destroy the surviving half of the record.
ALTER TABLE "TradeOffer"
  ADD CONSTRAINT "TradeOffer_counteredOfferId_fkey"
  FOREIGN KEY ("counteredOfferId") REFERENCES "TradeOffer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- "Is this cToon already committed to a pending trade?" is the hottest query in
-- the trade path: both guards in offers.post.js run it, and every collection
-- load runs it once with an IN-list the size of the user's whole collection.
-- The only index on this table is UNIQUE(tradeOfferId, userCtoonId, role), which
-- leads with tradeOfferId and therefore cannot serve a userCtoonId-only
-- predicate — all of the above were sequential scans. Counter offers multiply
-- the row count of this table (one negotiation becomes N offers, not 1), so the
-- scans get worse exactly as the feature gets used.
CREATE INDEX IF NOT EXISTS "TradeOfferCtoon_userCtoonId_idx"
  ON "TradeOfferCtoon"("userCtoonId");

-- TradeOffer had no indexes at all. Postgres does not index foreign keys
-- automatically, so the incoming/outgoing offer lists — which filter on one
-- party and sort by createdAt, and are refetched on every tab switch, accept and
-- reject — were seq-scanning and then externally sorting the entire table.
-- Trailing createdAt lets the ORDER BY be satisfied by the index with no sort
-- node; including status keeps a pending-only filter index-only.
CREATE INDEX IF NOT EXISTS "TradeOffer_recipientId_status_createdAt_idx"
  ON "TradeOffer"("recipientId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "TradeOffer_initiatorId_status_createdAt_idx"
  ON "TradeOffer"("initiatorId", "status", "createdAt");

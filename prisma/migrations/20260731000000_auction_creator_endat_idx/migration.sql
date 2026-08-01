-- /api/my-auctions filters on creatorId and orders by endAt desc. Postgres does
-- not index foreign keys automatically, so this query has been sequentially
-- scanning the whole Auction table on every load of the "My Auctions" tab.
CREATE INDEX IF NOT EXISTS "Auction_creatorId_endAt_idx" ON "Auction"("creatorId", "endAt");

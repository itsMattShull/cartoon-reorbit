-- Supports server/api/economy/active-top-auctions.get.js: filters
-- status = 'ACTIVE' AND "highestBid" > 0, orders by "highestBid" DESC, LIMIT 10.
-- A plain @@index([status, highestBid]) still leaves every ACTIVE row (most of
-- which never received a bid) in the index, so Postgres would have to walk and
-- sort all of them before the LIMIT. Restricting to rows that can actually
-- appear in that query keeps the index small and the lookup a direct
-- index-ordered scan.
--
-- Partial indexes have no equivalent in the Prisma schema language, so this
-- lives only in this migration — see the same pattern already used for
-- "Auction_active_userCtoonId_key" in
-- 20260803000000_unique_active_auction_per_user_ctoon. `prisma migrate dev`
-- will report it as drift and offer to drop it — keep it.
CREATE INDEX "Auction_active_highestBid_idx"
    ON "Auction"("highestBid" DESC)
 WHERE status = 'ACTIVE' AND "highestBid" > 0;

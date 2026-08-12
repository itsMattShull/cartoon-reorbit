-- Index the "is this copy already spoken for by a pending listing?" lookup.
--
-- Three places ask that question, all of them filtering AuctionOnly by
-- userCtoonId and isStarted:
--
--   * server/api/admin/auction-only/owned.get.js and index.post.js, which hide
--     already-scheduled copies from the admin picker, and
--   * createDailyFeaturedAuction (server/cron/sync-guild-members.js), which now
--     excludes them from the random featured-auction draw. That one expresses it
--     as a NOT EXISTS correlated subquery over the official account's whole
--     inventory, so it runs once per candidate row.
--
-- AuctionOnly previously carried indexes on startsAt and endsAt only, leaving
-- that subquery to sequentially scan the table for every candidate.
CREATE INDEX "AuctionOnly_userCtoonId_isStarted_idx"
    ON "AuctionOnly"("userCtoonId", "isStarted");

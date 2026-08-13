-- Backs the pending-listing check in createDailyFeaturedAuction (excludes
-- userCtoons with a pending AuctionOnly listing via a relation filter).
CREATE INDEX "AuctionOnly_userCtoonId_isStarted_idx" ON "AuctionOnly"("userCtoonId", "isStarted");

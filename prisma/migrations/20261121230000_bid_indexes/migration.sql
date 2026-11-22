-- Bid had only its primary key, so every query by auctionId or userId was a sequential scan of a
-- table that only ever grows (auction pages and lists, My Bids, auction settlement, workers).
CREATE INDEX "Bid_auctionId_amount_idx" ON "Bid"("auctionId", "amount");

CREATE INDEX "Bid_userId_auctionId_idx" ON "Bid"("userId", "auctionId");

CREATE INDEX "Bid_createdAt_idx" ON "Bid"("createdAt");

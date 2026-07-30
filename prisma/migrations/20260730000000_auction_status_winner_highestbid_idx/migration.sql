-- DropIndex
DROP INDEX "Auction_status_winnerId_idx";

-- CreateIndex
CREATE INDEX "Auction_status_winnerId_highestBid_idx" ON "Auction"("status", "winnerId", "highestBid");

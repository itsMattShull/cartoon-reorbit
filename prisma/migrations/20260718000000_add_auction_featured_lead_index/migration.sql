-- CreateIndex
CREATE INDEX "Auction_isFeatured_status_highestBidderId_idx" ON "Auction"("isFeatured", "status", "highestBidderId");

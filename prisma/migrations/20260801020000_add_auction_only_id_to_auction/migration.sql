-- Back-reference so admin removal of an AuctionOnly listing can reliably find
-- the Auction it activated into, instead of guessing via userCtoonId+endAt.
ALTER TABLE "Auction" ADD COLUMN "auctionOnlyId" TEXT;

CREATE UNIQUE INDEX "Auction_auctionOnlyId_key" ON "Auction"("auctionOnlyId");

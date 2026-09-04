-- AlterTable
ALTER TABLE "AuctionOnly" ADD COLUMN "featuredOwnLimit" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN "featuredOwnLimit" INTEGER NOT NULL DEFAULT 2;

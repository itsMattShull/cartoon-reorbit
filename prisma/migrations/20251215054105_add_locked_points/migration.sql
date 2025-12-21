-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS    "allowWishlistAuctionNotifications" BOOLEAN NOT NULL DEFAULT true;

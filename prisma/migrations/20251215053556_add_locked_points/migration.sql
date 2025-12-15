/*
  Warnings:

  - You are about to drop the column `allowWishlistAuctionNotifications` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LockedPointsReason" AS ENUM ('AUCTION_BID', 'AUTOBID', 'TRADE_OFFER');

-- CreateEnum
CREATE TYPE "LockedPointsStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "LockedContextType" AS ENUM ('AUCTION', 'TRADE');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "allowWishlistAuctionNotifications";

-- CreateTable
CREATE TABLE "loackedPoints" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "LockedPointsReason" NOT NULL,
    "status" "LockedPointsStatus" NOT NULL DEFAULT 'ACTIVE',
    "contextType" "LockedContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loackedPoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loackedPoints_userId_status_idx" ON "loackedPoints"("userId", "status");

-- CreateIndex
CREATE INDEX "loackedPoints_contextType_contextId_status_idx" ON "loackedPoints"("contextType", "contextId", "status");

-- AddForeignKey
ALTER TABLE "loackedPoints" ADD CONSTRAINT "loackedPoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "userCtoonId" TEXT NOT NULL,
    "initialBet" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Auction_userCtoonId_status_idx" ON "Auction"("userCtoonId", "status");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

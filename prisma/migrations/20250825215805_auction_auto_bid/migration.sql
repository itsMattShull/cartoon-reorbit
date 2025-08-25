-- CreateTable
CREATE TABLE "AuctionAutoBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxAmount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionAutoBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuctionAutoBid_auctionId_createdAt_idx" ON "AuctionAutoBid"("auctionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionAutoBid_auctionId_userId_key" ON "AuctionAutoBid"("auctionId", "userId");

-- AddForeignKey
ALTER TABLE "AuctionAutoBid" ADD CONSTRAINT "AuctionAutoBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionAutoBid" ADD CONSTRAINT "AuctionAutoBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

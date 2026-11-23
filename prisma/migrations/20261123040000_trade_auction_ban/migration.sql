-- Admin "Ban Trades/Auctions" tool: pairs of users who may not trade with each other or bid on each other's
-- auctions. New table only, so existing rows are untouched. A pair is stored once, in id order, so the unique index
-- catches a second ban of the same two users whichever way round the admin picks them.

-- CreateTable
CREATE TABLE "TradeAuctionBan" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeAuctionBan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradeAuctionBan_pair_order_check" CHECK ("userAId" < "userBId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeAuctionBan_userAId_userBId_key" ON "TradeAuctionBan"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "TradeAuctionBan_userBId_idx" ON "TradeAuctionBan"("userBId");

-- CreateIndex
CREATE INDEX "TradeAuctionBan_createdAt_idx" ON "TradeAuctionBan"("createdAt");

-- AddForeignKey
ALTER TABLE "TradeAuctionBan" ADD CONSTRAINT "TradeAuctionBan_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAuctionBan" ADD CONSTRAINT "TradeAuctionBan_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

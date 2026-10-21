-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_userCtoonId_fkey";

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "userPackId" TEXT,
ALTER COLUMN "userCtoonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "packAuctionMinBidPercent" INTEGER NOT NULL DEFAULT 25;

-- CreateTable
CREATE TABLE "TradeOfferPack" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "userPackId" TEXT NOT NULL,
    "role" "TradeOfferCtoonRole" NOT NULL,

    CONSTRAINT "TradeOfferPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeOfferPack_userPackId_idx" ON "TradeOfferPack"("userPackId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOfferPack_tradeOfferId_userPackId_role_key" ON "TradeOfferPack"("tradeOfferId", "userPackId", "role");

-- CreateIndex
CREATE INDEX "Auction_userPackId_status_idx" ON "Auction"("userPackId", "status");

-- AddForeignKey
ALTER TABLE "TradeOfferPack" ADD CONSTRAINT "TradeOfferPack_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferPack" ADD CONSTRAINT "TradeOfferPack_userPackId_fkey" FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userPackId_fkey" FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one of userCtoonId/userPackId must be set per row — not expressible as a Prisma schema
-- constraint (same "lives only in the migration" convention this table's existing partial unique
-- indexes already use, see Auction_active_userCtoonId_key's own comment).
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_exactly_one_item_check"
    CHECK (("userCtoonId" IS NOT NULL) <> ("userPackId" IS NOT NULL));

-- Partial unique index: only ACTIVE rows participate, same convention as
-- Auction_active_userCtoonId_key (see migration 20260803000000_unique_active_auction_per_user_ctoon)
-- — stops the same pack being auctioned twice at once.
CREATE UNIQUE INDEX "Auction_active_userPackId_key"
    ON "Auction"("userPackId")
 WHERE status = 'ACTIVE';

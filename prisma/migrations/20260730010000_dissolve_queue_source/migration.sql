-- AlterTable: track origin of DissolveAuctionQueue entries
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "fromInactive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "sourceUsername" TEXT;

-- CreateIndex
CREATE INDEX "DissolveAuctionQueue_fromInactive_idx" ON "DissolveAuctionQueue"("fromInactive");

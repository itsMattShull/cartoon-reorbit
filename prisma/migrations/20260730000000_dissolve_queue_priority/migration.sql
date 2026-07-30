-- AlterTable: add priority flag to DissolveAuctionQueue
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "priority" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DissolveAuctionQueue_priority_idx" ON "DissolveAuctionQueue"("priority");

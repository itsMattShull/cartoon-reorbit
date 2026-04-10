-- AlterTable: add category, isFeatured, scheduledFor to DissolveAuctionQueue
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DissolveAuctionQueue_category_idx" ON "DissolveAuctionQueue"("category");

-- CreateIndex
CREATE INDEX "DissolveAuctionQueue_scheduledFor_idx" ON "DissolveAuctionQueue"("scheduledFor");

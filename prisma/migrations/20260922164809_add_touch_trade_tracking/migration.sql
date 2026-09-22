-- AlterTable
ALTER TABLE "CtoonOwnerLog" ADD COLUMN     "tradeOfferId" TEXT;

-- AlterTable
ALTER TABLE "TradeOffer" ADD COLUMN     "acceptedByIp" TEXT,
ADD COLUMN     "acceptedByUserAgent" TEXT,
ADD COLUMN     "acceptedByUserId" TEXT,
ADD COLUMN     "initiatorIp" TEXT,
ADD COLUMN     "initiatorUserAgent" TEXT;

-- CreateTable
CREATE TABLE "TouchTradeConfirmation" (
    "id" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "ctoonId" TEXT,
    "mintNumber" INTEGER,
    "userAId" TEXT,
    "userBId" TEXT,
    "note" TEXT,
    "confirmedByUserId" TEXT NOT NULL,
    "confirmedByUsername" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TouchTradeConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TouchTradeConfirmation_groupKey_key" ON "TouchTradeConfirmation"("groupKey");

-- CreateIndex
CREATE INDEX "TouchTradeConfirmation_confirmedAt_idx" ON "TouchTradeConfirmation"("confirmedAt");

-- CreateIndex
CREATE INDEX "CtoonOwnerLog_ctoonId_mintNumber_method_createdAt_idx" ON "CtoonOwnerLog"("ctoonId", "mintNumber", "method", "createdAt");

-- AddForeignKey
ALTER TABLE "TouchTradeConfirmation" ADD CONSTRAINT "TouchTradeConfirmation_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtoonOwnerLog" ADD CONSTRAINT "CtoonOwnerLog_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

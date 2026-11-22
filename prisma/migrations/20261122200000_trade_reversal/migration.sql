-- Admin Trade Reversal tool: one row per reversed TradeOffer. The unique tradeOfferId is what stops a trade being
-- reversed twice. New table only, so existing rows are untouched.

-- CreateTable
CREATE TABLE "TradeReversal" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminUsername" TEXT,
    "includeFairMarketValue" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeReversal_tradeOfferId_key" ON "TradeReversal"("tradeOfferId");

-- CreateIndex
CREATE INDEX "TradeReversal_createdAt_idx" ON "TradeReversal"("createdAt");

-- AddForeignKey
ALTER TABLE "TradeReversal" ADD CONSTRAINT "TradeReversal_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


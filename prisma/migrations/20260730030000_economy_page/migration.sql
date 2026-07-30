-- CreateEnum
CREATE TYPE "EconomySource" AS ENUM ('AUCTION', 'TRADE');

-- CreateTable
CREATE TABLE "CtoonPriceDaily" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "source" "EconomySource" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER NOT NULL,

    CONSTRAINT "CtoonPriceDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyAggregateCursor" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastAuctionProcessedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
    "lastTradeProcessedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomyAggregateCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CtoonPriceDaily_ctoonId_source_date_key" ON "CtoonPriceDaily"("ctoonId", "source", "date");

-- CreateIndex
CREATE INDEX "CtoonPriceDaily_source_date_ctoonId_idx" ON "CtoonPriceDaily"("source", "date", "ctoonId");

-- AddForeignKey
ALTER TABLE "CtoonPriceDaily" ADD CONSTRAINT "CtoonPriceDaily_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

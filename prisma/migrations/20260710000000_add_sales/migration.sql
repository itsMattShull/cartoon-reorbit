-- AlterTable
ALTER TABLE "CmartPurchaseLog" ADD COLUMN     "saleId" TEXT;

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePath" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleCtoon" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "perDayLimit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleDailyPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SaleDailyPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_startAt_endAt_idx" ON "Sale"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "SaleCtoon_ctoonId_idx" ON "SaleCtoon"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleCtoon_saleId_ctoonId_key" ON "SaleCtoon"("saleId", "ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleDailyPurchase_userId_ctoonId_saleId_windowStart_key" ON "SaleDailyPurchase"("userId", "ctoonId", "saleId", "windowStart");

-- CreateIndex
CREATE INDEX "CmartPurchaseLog_userId_ctoonId_saleId_createdAt_idx" ON "CmartPurchaseLog"("userId", "ctoonId", "saleId", "createdAt");

-- AddForeignKey
ALTER TABLE "CmartPurchaseLog" ADD CONSTRAINT "CmartPurchaseLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleCtoon" ADD CONSTRAINT "SaleCtoon_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleCtoon" ADD CONSTRAINT "SaleCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDailyPurchase" ADD CONSTRAINT "SaleDailyPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDailyPurchase" ADD CONSTRAINT "SaleDailyPurchase_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDailyPurchase" ADD CONSTRAINT "SaleDailyPurchase_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

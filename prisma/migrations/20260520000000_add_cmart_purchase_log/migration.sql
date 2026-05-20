-- CreateTable
CREATE TABLE "CmartPurchaseLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmartPurchaseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CmartPurchaseLog_userId_createdAt_idx" ON "CmartPurchaseLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CmartPurchaseLog_ctoonId_createdAt_idx" ON "CmartPurchaseLog"("ctoonId", "createdAt");

-- CreateIndex
CREATE INDEX "CmartPurchaseLog_createdAt_idx" ON "CmartPurchaseLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CmartPurchaseLog" ADD CONSTRAINT "CmartPurchaseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmartPurchaseLog" ADD CONSTRAINT "CmartPurchaseLog_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UserScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "outcome" "ScanOutcome" NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserScan_userId_idx" ON "UserScan"("userId");

-- CreateIndex
CREATE INDEX "UserScan_mappingId_idx" ON "UserScan"("mappingId");

-- CreateIndex
CREATE INDEX "UserScan_configId_idx" ON "UserScan"("configId");

-- CreateIndex
CREATE INDEX "UserScan_scannedAt_idx" ON "UserScan"("scannedAt");

-- AddForeignKey
ALTER TABLE "UserScan" ADD CONSTRAINT "UserScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScan" ADD CONSTRAINT "UserScan_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "BarcodeMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScan" ADD CONSTRAINT "UserScan_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

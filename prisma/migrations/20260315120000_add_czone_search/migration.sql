-- CreateEnum
CREATE TYPE "CZoneSearchCollectionType" AS ENUM ('ONCE', 'MULTIPLE');

-- CreateTable
CREATE TABLE "CZoneSearch" (
    "id" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "appearanceRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cooldownHours" INTEGER NOT NULL DEFAULT 0,
    "collectionType" "CZoneSearchCollectionType" NOT NULL DEFAULT 'MULTIPLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CZoneSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CZoneSearchPrize" (
    "id" TEXT NOT NULL,
    "cZoneSearchId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "chancePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CZoneSearchPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CZoneSearchAppearance" (
    "id" TEXT NOT NULL,
    "cZoneSearchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "zoneOwnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneSearchAppearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CZoneSearchCapture" (
    "id" TEXT NOT NULL,
    "appearanceId" TEXT NOT NULL,
    "cZoneSearchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneSearchCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CZoneSearch_startAt_idx" ON "CZoneSearch"("startAt");

-- CreateIndex
CREATE INDEX "CZoneSearch_endAt_idx" ON "CZoneSearch"("endAt");

-- CreateIndex
CREATE UNIQUE INDEX "CZoneSearchPrize_cZoneSearchId_ctoonId_key" ON "CZoneSearchPrize"("cZoneSearchId", "ctoonId");

-- CreateIndex
CREATE INDEX "CZoneSearchPrize_ctoonId_idx" ON "CZoneSearchPrize"("ctoonId");

-- CreateIndex
CREATE INDEX "CZoneSearchAppearance_userId_cZoneSearchId_createdAt_idx" ON "CZoneSearchAppearance"("userId", "cZoneSearchId", "createdAt");

-- CreateIndex
CREATE INDEX "CZoneSearchAppearance_cZoneSearchId_createdAt_idx" ON "CZoneSearchAppearance"("cZoneSearchId", "createdAt");

-- CreateIndex
CREATE INDEX "CZoneSearchAppearance_zoneOwnerId_createdAt_idx" ON "CZoneSearchAppearance"("zoneOwnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CZoneSearchCapture_appearanceId_key" ON "CZoneSearchCapture"("appearanceId");

-- CreateIndex
CREATE INDEX "CZoneSearchCapture_userId_cZoneSearchId_createdAt_idx" ON "CZoneSearchCapture"("userId", "cZoneSearchId", "createdAt");

-- CreateIndex
CREATE INDEX "CZoneSearchCapture_cZoneSearchId_createdAt_idx" ON "CZoneSearchCapture"("cZoneSearchId", "createdAt");

-- CreateIndex
CREATE INDEX "CZoneSearchCapture_ctoonId_createdAt_idx" ON "CZoneSearchCapture"("ctoonId", "createdAt");

-- AddForeignKey
ALTER TABLE "CZoneSearchPrize" ADD CONSTRAINT "CZoneSearchPrize_cZoneSearchId_fkey" FOREIGN KEY ("cZoneSearchId") REFERENCES "CZoneSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchPrize" ADD CONSTRAINT "CZoneSearchPrize_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchAppearance" ADD CONSTRAINT "CZoneSearchAppearance_cZoneSearchId_fkey" FOREIGN KEY ("cZoneSearchId") REFERENCES "CZoneSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchAppearance" ADD CONSTRAINT "CZoneSearchAppearance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchAppearance" ADD CONSTRAINT "CZoneSearchAppearance_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchAppearance" ADD CONSTRAINT "CZoneSearchAppearance_zoneOwnerId_fkey" FOREIGN KEY ("zoneOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchCapture" ADD CONSTRAINT "CZoneSearchCapture_appearanceId_fkey" FOREIGN KEY ("appearanceId") REFERENCES "CZoneSearchAppearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchCapture" ADD CONSTRAINT "CZoneSearchCapture_cZoneSearchId_fkey" FOREIGN KEY ("cZoneSearchId") REFERENCES "CZoneSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchCapture" ADD CONSTRAINT "CZoneSearchCapture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchCapture" ADD CONSTRAINT "CZoneSearchCapture_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

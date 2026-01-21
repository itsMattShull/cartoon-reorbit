-- DropForeignKey
ALTER TABLE "CZoneSearchAppearance" DROP CONSTRAINT "CZoneSearchAppearance_ctoonId_fkey";

-- DropForeignKey
ALTER TABLE "CZoneSearchCapture" DROP CONSTRAINT "CZoneSearchCapture_ctoonId_fkey";

-- DropForeignKey
ALTER TABLE "CZoneSearchPrize" DROP CONSTRAINT "CZoneSearchPrize_ctoonId_fkey";

-- AddForeignKey
ALTER TABLE "CZoneSearchPrize" ADD CONSTRAINT "CZoneSearchPrize_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchAppearance" ADD CONSTRAINT "CZoneSearchAppearance_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneSearchCapture" ADD CONSTRAINT "CZoneSearchCapture_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

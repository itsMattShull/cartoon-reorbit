-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "finalReleaseAt" TIMESTAMP(3),
ADD COLUMN     "finalReleaseQty" INTEGER,
ADD COLUMN     "initialReleaseAt" TIMESTAMP(3),
ADD COLUMN     "initialReleaseQty" INTEGER;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "finalReleaseDelayHours" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "initialReleasePercent" INTEGER NOT NULL DEFAULT 75;

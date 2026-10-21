-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "standardizeMetric" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cmartStandardizedMetrics" JSONB;

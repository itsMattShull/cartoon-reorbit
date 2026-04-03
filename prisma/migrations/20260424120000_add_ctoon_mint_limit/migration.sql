-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN "mintLimitType" TEXT NOT NULL DEFAULT 'defined',
ADD COLUMN "mintEndDate" TIMESTAMP(3);

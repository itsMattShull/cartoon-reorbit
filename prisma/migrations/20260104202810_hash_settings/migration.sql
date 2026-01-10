-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "dhashDuplicateThreshold" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "phashDuplicateThreshold" INTEGER NOT NULL DEFAULT 14;

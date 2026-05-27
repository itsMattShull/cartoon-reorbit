/*
  Warnings:

  - You are about to drop the column `featuredAuctionsPerDay` on the `GlobalGameConfig` table. All the data in the column will be lost.
  - You are about to drop the column `firstAdditionalCzoneCost` on the `GlobalGameConfig` table. All the data in the column will be lost.
  - You are about to drop the column `subsequentAdditionalCzoneCost` on the `GlobalGameConfig` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "LottoLog_userCtoonId_idx";

-- AlterTable
ALTER TABLE "GlobalGameConfig" DROP COLUMN "featuredAuctionsPerDay",
DROP COLUMN "firstAdditionalCzoneCost",
DROP COLUMN "subsequentAdditionalCzoneCost";

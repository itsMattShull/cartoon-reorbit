/*
  Warnings:

  - You are about to drop the column `ctoonId` on the `ClaimCodeReward` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `ClaimCodeReward` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClaimCodeReward" DROP CONSTRAINT "ClaimCodeReward_ctoonId_fkey";

-- AlterTable
ALTER TABLE "ClaimCodeReward" DROP COLUMN "ctoonId",
DROP COLUMN "quantity",
ADD COLUMN     "points" INTEGER;

-- CreateTable
CREATE TABLE "RewardCtoon" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RewardCtoon_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RewardCtoon" ADD CONSTRAINT "RewardCtoon_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "ClaimCodeReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardCtoon" ADD CONSTRAINT "RewardCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ClaimCodeReward" ADD COLUMN     "pooledUniqueCount" INTEGER;

-- CreateTable
CREATE TABLE "RewardCtoonPool" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RewardCtoonPool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardCtoonPool_ctoonId_idx" ON "RewardCtoonPool"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardCtoonPool_rewardId_ctoonId_key" ON "RewardCtoonPool"("rewardId", "ctoonId");

-- AddForeignKey
ALTER TABLE "RewardCtoonPool" ADD CONSTRAINT "RewardCtoonPool_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "ClaimCodeReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardCtoonPool" ADD CONSTRAINT "RewardCtoonPool_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

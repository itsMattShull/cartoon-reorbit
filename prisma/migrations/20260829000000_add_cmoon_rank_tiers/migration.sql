-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "cMoonRankTierId" TEXT;

-- AlterTable
ALTER TABLE "CMoonRank" ADD COLUMN     "tierId" TEXT;

-- CreateTable
CREATE TABLE "CMoonRankTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "pointThreshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonRankTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonRankTierRewardCtoon" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CMoonRankTierRewardCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonRankTier_name_key" ON "CMoonRankTier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonRankTier_sortOrder_key" ON "CMoonRankTier"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonRankTierRewardCtoon_tierId_ctoonId_key" ON "CMoonRankTierRewardCtoon"("tierId", "ctoonId");

-- CreateIndex
CREATE INDEX "CMoonRankTierRewardCtoon_ctoonId_idx" ON "CMoonRankTierRewardCtoon"("ctoonId");

-- CreateIndex
CREATE INDEX "Achievement_cMoonRankTierId_idx" ON "Achievement"("cMoonRankTierId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonRank_cMoonId_tierId_key" ON "CMoonRank"("cMoonId", "tierId");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_cMoonRankTierId_fkey" FOREIGN KEY ("cMoonRankTierId") REFERENCES "CMoonRankTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonRank" ADD CONSTRAINT "CMoonRank_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CMoonRankTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonRankTierRewardCtoon" ADD CONSTRAINT "CMoonRankTierRewardCtoon_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CMoonRankTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonRankTierRewardCtoon" ADD CONSTRAINT "CMoonRankTierRewardCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

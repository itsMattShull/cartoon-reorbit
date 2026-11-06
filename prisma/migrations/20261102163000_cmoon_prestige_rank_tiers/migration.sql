-- CreateEnum
CREATE TYPE "CMoonPrestigeRankRewardType" AS ENUM ('CTOON', 'AVATAR', 'BACKGROUND', 'POINTS', 'PACK');

-- AlterEnum
ALTER TYPE "PackSource" ADD VALUE 'CMOON_PRESTIGE_RANK';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentCMoonPrestigeRankId" TEXT;

-- CreateTable
CREATE TABLE "CMoonPrestigeRankTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "pointThreshold" INTEGER NOT NULL,
    "rewardType" "CMoonPrestigeRankRewardType" NOT NULL DEFAULT 'POINTS',
    "ctoonId" TEXT,
    "avatarId" TEXT,
    "backgroundId" TEXT,
    "packId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonPrestigeRankTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPrestigeRank" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonPrestigeRank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPrestigeRankTier_name_key" ON "CMoonPrestigeRankTier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPrestigeRankTier_sortOrder_key" ON "CMoonPrestigeRankTier"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPrestigeRank_cMoonId_tierId_key" ON "CMoonPrestigeRank"("cMoonId", "tierId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentCMoonPrestigeRankId_fkey" FOREIGN KEY ("currentCMoonPrestigeRankId") REFERENCES "CMoonPrestigeRank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeRankTier" ADD CONSTRAINT "CMoonPrestigeRankTier_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeRankTier" ADD CONSTRAINT "CMoonPrestigeRankTier_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeRankTier" ADD CONSTRAINT "CMoonPrestigeRankTier_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeRankTier" ADD CONSTRAINT "CMoonPrestigeRankTier_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeRank" ADD CONSTRAINT "CMoonPrestigeRank_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeRank" ADD CONSTRAINT "CMoonPrestigeRank_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CMoonPrestigeRankTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "RewardPack" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RewardPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "imagePath" TEXT,
    "inCmart" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackRarityConfig" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "PackRarityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackCtoonOption" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PackCtoonOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardPack_rewardId_packId_key" ON "RewardPack"("rewardId", "packId");

-- CreateIndex
CREATE UNIQUE INDEX "PackRarityConfig_packId_rarity_key" ON "PackRarityConfig"("packId", "rarity");

-- CreateIndex
CREATE UNIQUE INDEX "PackCtoonOption_packId_ctoonId_key" ON "PackCtoonOption"("packId", "ctoonId");

-- AddForeignKey
ALTER TABLE "RewardPack" ADD CONSTRAINT "RewardPack_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "ClaimCodeReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPack" ADD CONSTRAINT "RewardPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackRarityConfig" ADD CONSTRAINT "PackRarityConfig_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackCtoonOption" ADD CONSTRAINT "PackCtoonOption_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackCtoonOption" ADD CONSTRAINT "PackCtoonOption_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPack" ADD CONSTRAINT "UserPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPack" ADD CONSTRAINT "UserPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

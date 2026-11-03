-- CreateEnum
CREATE TYPE "CMoonBattleUpgradeStat" AS ENUM ('HP', 'STAMINA');

-- CreateTable
CREATE TABLE "CMoonBattleUpgrade" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stat" "CMoonBattleUpgradeStat" NOT NULL,
    "amount" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "purchaseLimit" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonBattleUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCMoonBattleUpgrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "timesPurchased" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCMoonBattleUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonBattleUpgrade_active_sortOrder_idx" ON "CMoonBattleUpgrade"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UserCMoonBattleUpgrade_userId_upgradeId_key" ON "UserCMoonBattleUpgrade"("userId", "upgradeId");

-- AddForeignKey
ALTER TABLE "UserCMoonBattleUpgrade" ADD CONSTRAINT "UserCMoonBattleUpgrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonBattleUpgrade" ADD CONSTRAINT "UserCMoonBattleUpgrade_upgradeId_fkey" FOREIGN KEY ("upgradeId") REFERENCES "CMoonBattleUpgrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

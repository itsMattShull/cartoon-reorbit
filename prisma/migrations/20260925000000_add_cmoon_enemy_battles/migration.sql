-- CreateEnum
CREATE TYPE "CMoonEnemyBattleMode" AS ENUM ('PER_PLAYER', 'SHARED_POOL');

-- CreateEnum
CREATE TYPE "CMoonEnemyBattleAction" AS ENUM ('ATTACK_HIGH', 'ATTACK_LOW', 'BLOCK_HIGH', 'BLOCK_LOW');

-- CreateEnum
CREATE TYPE "CMoonEnemyBattleStatus" AS ENUM ('IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CMoonEnemyBattleOutcome" AS ENUM ('WIN', 'LOSS', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CMoonEnemyRewardType" AS ENUM ('CTOON', 'AVATAR', 'BACKGROUND');

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonBattlePopupChancePercent" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "cMoonBattlePopupCooldownMinutes" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "battleLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "battleWins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CMoonEnemyFaction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerImagePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyFaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonEnemyMember" (
    "id" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePath" TEXT,
    "maxHp" INTEGER NOT NULL DEFAULT 5,
    "battleMode" "CMoonEnemyBattleMode" NOT NULL DEFAULT 'PER_PLAYER',
    "currentHp" INTEGER NOT NULL DEFAULT 5,
    "cMoonPointsReward" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defeatedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonEnemyReward" (
    "id" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "rewardType" "CMoonEnemyRewardType" NOT NULL,
    "ctoonId" TEXT,
    "avatarId" TEXT,
    "backgroundId" TEXT,
    "dropChancePercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonEnemyBattle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "status" "CMoonEnemyBattleStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "outcome" "CMoonEnemyBattleOutcome",
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "playerHpRemaining" INTEGER NOT NULL,
    "enemyHpRemaining" INTEGER NOT NULL,
    "roundLog" JSONB NOT NULL DEFAULT '[]',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "rewardsGranted" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "activeUserId" TEXT,

    CONSTRAINT "CMoonEnemyBattle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyFaction_name_key" ON "CMoonEnemyFaction"("name");

-- CreateIndex
CREATE INDEX "CMoonEnemyFaction_active_sortOrder_idx" ON "CMoonEnemyFaction"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "CMoonEnemyMember_active_defeatedAt_sortOrder_idx" ON "CMoonEnemyMember"("active", "defeatedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "CMoonEnemyReward_enemyMemberId_idx" ON "CMoonEnemyReward"("enemyMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyBattle_activeUserId_key" ON "CMoonEnemyBattle"("activeUserId");

-- CreateIndex
CREATE INDEX "CMoonEnemyBattle_enemyMemberId_status_idx" ON "CMoonEnemyBattle"("enemyMemberId", "status");

-- CreateIndex
CREATE INDEX "CMoonEnemyBattle_cMoonId_outcome_idx" ON "CMoonEnemyBattle"("cMoonId", "outcome");

-- AddForeignKey
ALTER TABLE "CMoonEnemyMember" ADD CONSTRAINT "CMoonEnemyMember_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "CMoonEnemyFaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyReward" ADD CONSTRAINT "CMoonEnemyReward_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyReward" ADD CONSTRAINT "CMoonEnemyReward_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyReward" ADD CONSTRAINT "CMoonEnemyReward_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyReward" ADD CONSTRAINT "CMoonEnemyReward_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyBattle" ADD CONSTRAINT "CMoonEnemyBattle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyBattle" ADD CONSTRAINT "CMoonEnemyBattle_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyBattle" ADD CONSTRAINT "CMoonEnemyBattle_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;


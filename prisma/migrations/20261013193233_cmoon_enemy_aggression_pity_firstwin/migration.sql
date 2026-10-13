-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "attackChancePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "firstWinBonusPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pityThreshold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CMoonEnemyRewardPity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "emptyWinStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyRewardPity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyRewardPity_userId_enemyMemberId_key" ON "CMoonEnemyRewardPity"("userId", "enemyMemberId");

-- AddForeignKey
ALTER TABLE "CMoonEnemyRewardPity" ADD CONSTRAINT "CMoonEnemyRewardPity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyRewardPity" ADD CONSTRAINT "CMoonEnemyRewardPity_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

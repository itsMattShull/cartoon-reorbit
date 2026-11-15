-- AlterEnum
ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'CATCH_ATTEMPT';

-- AlterEnum
ALTER TYPE "PackSource" ADD VALUE 'CMOON_ENEMY_CAPTURE';

-- AlterEnum
ALTER TYPE "CMoonEnemyBattleOutcome" ADD VALUE 'CAPTURED';

-- AlterTable
ALTER TABLE "CMoonEnemyMember"
  ADD COLUMN "catchable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "catchRatePercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN "cMoonEnemyCaptureMusicPath" TEXT;

-- CreateTable
CREATE TABLE "CMoonEnemyCaptureReward" (
    "id" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "rewardType" "CMoonEnemyRewardType" NOT NULL,
    "ctoonId" TEXT,
    "avatarId" TEXT,
    "backgroundId" TEXT,
    "packId" TEXT,
    "dropChancePercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyCaptureReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyCaptureReward_enemyMemberId_idx" ON "CMoonEnemyCaptureReward"("enemyMemberId");

-- AddForeignKey
ALTER TABLE "CMoonEnemyCaptureReward" ADD CONSTRAINT "CMoonEnemyCaptureReward_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyCaptureReward" ADD CONSTRAINT "CMoonEnemyCaptureReward_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyCaptureReward" ADD CONSTRAINT "CMoonEnemyCaptureReward_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyCaptureReward" ADD CONSTRAINT "CMoonEnemyCaptureReward_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyCaptureReward" ADD CONSTRAINT "CMoonEnemyCaptureReward_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

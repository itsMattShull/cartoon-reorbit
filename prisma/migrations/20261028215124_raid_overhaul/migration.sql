-- CreateEnum
CREATE TYPE "CMoonWindUpDirection" AS ENUM ('HIGH', 'LOW');

-- CreateEnum
CREATE TYPE "CMoonWindUpBonusType" AS ENUM ('HEAL_PARTY', 'DAMAGE_ENEMY');

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "maxParticipants" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "windUpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CMoonEnemyRaid" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CMoonSpecialAttack" ADD COLUMN     "playerChoice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonRaidJoinWindowSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "cMoonRaidSoloRewardMultiplierPercent" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chosenSpecialAttackId" TEXT;

-- CreateTable
CREATE TABLE "CMoonEnemyWindUpMove" (
    "id" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "telegraphMessage" TEXT NOT NULL,
    "direction" "CMoonWindUpDirection" NOT NULL,
    "occurrencePercent" INTEGER NOT NULL DEFAULT 25,
    "bonusType" "CMoonWindUpBonusType" NOT NULL,
    "bonusAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyWindUpMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyWindUpMove_enemyMemberId_idx" ON "CMoonEnemyWindUpMove"("enemyMemberId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_chosenSpecialAttackId_fkey" FOREIGN KEY ("chosenSpecialAttackId") REFERENCES "CMoonSpecialAttack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyWindUpMove" ADD CONSTRAINT "CMoonEnemyWindUpMove_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

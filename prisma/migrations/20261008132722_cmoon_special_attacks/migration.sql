-- CreateEnum
CREATE TYPE "CMoonSpecialAttackEffectType" AS ENUM ('DAMAGE_OPPONENT', 'HEAL_SELF', 'PARALYZE_OPPONENT', 'LOWER_OPPONENT_ATTACK', 'RAISE_ALLY_ATTACK');

-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "specialAttackId" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyBattle" ADD COLUMN     "enemyAtkBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enemyHitStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enemyParalyzedTurns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playerAtkBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playerHitStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playerParalyzedTurns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playerSpecialCharged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CMoonEnemyFaction" ADD COLUMN     "specialAttackId" TEXT;

-- CreateTable
CREATE TABLE "CMoonSpecialAttack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "effectType" "CMoonSpecialAttackEffectType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "soundPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonSpecialAttack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonSpecialAttack_name_key" ON "CMoonSpecialAttack"("name");

-- AddForeignKey
ALTER TABLE "CMoon" ADD CONSTRAINT "CMoon_specialAttackId_fkey" FOREIGN KEY ("specialAttackId") REFERENCES "CMoonSpecialAttack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyFaction" ADD CONSTRAINT "CMoonEnemyFaction_specialAttackId_fkey" FOREIGN KEY ("specialAttackId") REFERENCES "CMoonSpecialAttack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

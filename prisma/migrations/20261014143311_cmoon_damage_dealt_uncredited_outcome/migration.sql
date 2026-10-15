-- AlterEnum
ALTER TYPE "CMoonEnemyBattleOutcome" ADD VALUE 'UNCREDITED';

-- AlterTable
ALTER TABLE "CMoonEnemyBattle" ADD COLUMN     "damageDealt" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CMoonEnemyBattle" ADD COLUMN     "playerMaxHp" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "CMoonRankTier" ADD COLUMN     "cMoonEnemyBattleHpBonus" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonEnemyBattleDefaultHp" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "CMoonEnemyBattle" ADD COLUMN     "playerMaxStamina" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playerStamina" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonEnemyBattleBlockCounterDamage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cMoonEnemyBattleStartingStamina" INTEGER NOT NULL DEFAULT 3;

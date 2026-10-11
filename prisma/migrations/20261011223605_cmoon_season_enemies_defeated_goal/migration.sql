-- AlterTable
ALTER TABLE "CMoonSeasonConfig" ADD COLUMN     "enemiesDefeatedGoalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enemiesDefeatedGoalLabel" TEXT NOT NULL DEFAULT 'Enemies Defeated',
ADD COLUMN     "enemiesDefeatedGoalTarget" INTEGER NOT NULL DEFAULT 1000;

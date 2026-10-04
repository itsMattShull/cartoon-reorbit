-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "raidCooldownMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "raidDefeatedAt" TIMESTAMP(3),
ADD COLUMN     "raidOneTime" BOOLEAN NOT NULL DEFAULT false;

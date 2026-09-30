-- CreateEnum
CREATE TYPE "CMoonEnemyRaidStatus" AS ENUM ('FORMING', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CMoonEnemyRaidOutcome" AS ENUM ('WIN', 'LOSS', 'ABANDONED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CMOON_RAID_BOSS_STARTED';

-- AlterTable
ALTER TABLE "CMoonEnemyBattle" ADD COLUMN     "raidId" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "isRaidBoss" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "raidAnnouncementText" TEXT;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonRaidBossDiscordChannelId" TEXT;

-- CreateTable
CREATE TABLE "CMoonEnemyRaid" (
    "id" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "status" "CMoonEnemyRaidStatus" NOT NULL DEFAULT 'FORMING',
    "outcome" "CMoonEnemyRaidOutcome",
    "enemyHpRemaining" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "joinDeadlineAt" TIMESTAMP(3) NOT NULL,
    "combatStartedAt" TIMESTAMP(3),
    "roundLog" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CMoonEnemyRaid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonEnemyRaidParticipant" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hpRemaining" INTEGER NOT NULL,
    "knockedOutAt" TIMESTAMP(3),
    "isInitiator" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardsGranted" JSONB,
    "activeUserId" TEXT,

    CONSTRAINT "CMoonEnemyRaidParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyRaid_enemyMemberId_idx" ON "CMoonEnemyRaid"("enemyMemberId");

-- CreateIndex
CREATE INDEX "CMoonEnemyRaid_cMoonId_status_idx" ON "CMoonEnemyRaid"("cMoonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyRaidParticipant_activeUserId_key" ON "CMoonEnemyRaidParticipant"("activeUserId");

-- CreateIndex
CREATE INDEX "CMoonEnemyRaidParticipant_userId_idx" ON "CMoonEnemyRaidParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyRaidParticipant_raidId_userId_key" ON "CMoonEnemyRaidParticipant"("raidId", "userId");

-- CreateIndex
CREATE INDEX "CMoonEnemyBattle_raidId_idx" ON "CMoonEnemyBattle"("raidId");

-- AddForeignKey
ALTER TABLE "CMoonEnemyBattle" ADD CONSTRAINT "CMoonEnemyBattle_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "CMoonEnemyRaid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyRaid" ADD CONSTRAINT "CMoonEnemyRaid_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyRaid" ADD CONSTRAINT "CMoonEnemyRaid_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyRaidParticipant" ADD CONSTRAINT "CMoonEnemyRaidParticipant_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "CMoonEnemyRaid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyRaidParticipant" ADD CONSTRAINT "CMoonEnemyRaidParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

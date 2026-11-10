-- CreateEnum
CREATE TYPE "CMoonPvpMatchStatus" AS ENUM ('FORMING', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CMoonPvpMatchOutcome" AS ENUM ('TEAM_A_WIN', 'TEAM_B_WIN', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CMoonPvpTeam" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "CMoonPvpRewardContext" AS ENUM ('MATCH_WIN', 'MATCH_PARTICIPATION', 'TOURNAMENT_WINNER', 'TOURNAMENT_PARTICIPATION');

-- CreateEnum
CREATE TYPE "CMoonPvpTournamentFormat" AS ENUM ('SINGLE_ELIM');

-- CreateEnum
CREATE TYPE "CMoonPvpTournamentStatus" AS ENUM ('DRAFT', 'ENTRY_OPEN', 'ENTRY_CLOSED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- AlterTable
ALTER TABLE "CMoonSpecialAttack" ADD COLUMN     "pvpEligible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonPvpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonPvpEqualizeHpAmount" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "cMoonPvpEqualizeHpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonPvpJoinWindowSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "cMoonPvpMaxTeamSize" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "cMoonPvpPointsPerWin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cMoonPvpPrivateLobbiesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cMoonPvpRoundLimit" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "cMoonPvpTeammatesOnlyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CMoonPvpParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" "CMoonPvpTeam" NOT NULL,
    "hpRemaining" INTEGER NOT NULL,
    "knockedOutAt" TIMESTAMP(3),
    "isInitiator" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardsGranted" JSONB,
    "activeUserId" TEXT,

    CONSTRAINT "CMoonPvpParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPvpReward" (
    "id" TEXT NOT NULL,
    "context" "CMoonPvpRewardContext" NOT NULL,
    "rewardType" "CMoonEnemyRewardType" NOT NULL,
    "ctoonId" TEXT,
    "avatarId" TEXT,
    "backgroundId" TEXT,
    "packId" TEXT,
    "dropChancePercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonPvpReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPvpMatch" (
    "id" TEXT NOT NULL,
    "status" "CMoonPvpMatchStatus" NOT NULL DEFAULT 'FORMING',
    "outcome" "CMoonPvpMatchOutcome",
    "teamACMoonId" TEXT,
    "teamBCMoonId" TEXT,
    "maxTeamSize" INTEGER NOT NULL,
    "equalizeHpEnabled" BOOLEAN NOT NULL,
    "equalizeHpAmount" INTEGER,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "roundLog" JSONB NOT NULL DEFAULT '[]',
    "joinDeadlineAt" TIMESTAMP(3) NOT NULL,
    "combatStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "tournamentMatchId" TEXT,

    CONSTRAINT "CMoonPvpMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPvpTournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CMoonPvpTournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "format" "CMoonPvpTournamentFormat" NOT NULL DEFAULT 'SINGLE_ELIM',
    "maxTeamSize" INTEGER NOT NULL DEFAULT 4,
    "announcementText" TEXT,
    "discordChannelId" TEXT,
    "winnerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonPvpTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPvpTournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "cMoonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonPvpTournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPvpTournamentEntryMember" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CMoonPvpTournamentEntryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPvpTournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "entryAId" TEXT,
    "entryBId" TEXT,
    "winnerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonPvpTournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPvpParticipant_activeUserId_key" ON "CMoonPvpParticipant"("activeUserId");

-- CreateIndex
CREATE INDEX "CMoonPvpParticipant_userId_idx" ON "CMoonPvpParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPvpParticipant_matchId_userId_key" ON "CMoonPvpParticipant"("matchId", "userId");

-- CreateIndex
CREATE INDEX "CMoonPvpReward_context_idx" ON "CMoonPvpReward"("context");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPvpMatch_tournamentMatchId_key" ON "CMoonPvpMatch"("tournamentMatchId");

-- CreateIndex
CREATE INDEX "CMoonPvpMatch_status_idx" ON "CMoonPvpMatch"("status");

-- CreateIndex
CREATE INDEX "CMoonPvpMatch_teamACMoonId_idx" ON "CMoonPvpMatch"("teamACMoonId");

-- CreateIndex
CREATE INDEX "CMoonPvpMatch_teamBCMoonId_idx" ON "CMoonPvpMatch"("teamBCMoonId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPvpTournament_winnerEntryId_key" ON "CMoonPvpTournament"("winnerEntryId");

-- CreateIndex
CREATE INDEX "CMoonPvpTournament_status_idx" ON "CMoonPvpTournament"("status");

-- CreateIndex
CREATE INDEX "CMoonPvpTournamentEntry_tournamentId_idx" ON "CMoonPvpTournamentEntry"("tournamentId");

-- CreateIndex
CREATE INDEX "CMoonPvpTournamentEntry_cMoonId_idx" ON "CMoonPvpTournamentEntry"("cMoonId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPvpTournamentEntry_tournamentId_teamName_key" ON "CMoonPvpTournamentEntry"("tournamentId", "teamName");

-- CreateIndex
CREATE INDEX "CMoonPvpTournamentEntryMember_userId_idx" ON "CMoonPvpTournamentEntryMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPvpTournamentEntryMember_entryId_userId_key" ON "CMoonPvpTournamentEntryMember"("entryId", "userId");

-- CreateIndex
CREATE INDEX "CMoonPvpTournamentMatch_tournamentId_roundNumber_idx" ON "CMoonPvpTournamentMatch"("tournamentId", "roundNumber");

-- AddForeignKey
ALTER TABLE "CMoonPvpParticipant" ADD CONSTRAINT "CMoonPvpParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CMoonPvpMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpParticipant" ADD CONSTRAINT "CMoonPvpParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpReward" ADD CONSTRAINT "CMoonPvpReward_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpReward" ADD CONSTRAINT "CMoonPvpReward_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpReward" ADD CONSTRAINT "CMoonPvpReward_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpReward" ADD CONSTRAINT "CMoonPvpReward_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpMatch" ADD CONSTRAINT "CMoonPvpMatch_teamACMoonId_fkey" FOREIGN KEY ("teamACMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpMatch" ADD CONSTRAINT "CMoonPvpMatch_teamBCMoonId_fkey" FOREIGN KEY ("teamBCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpMatch" ADD CONSTRAINT "CMoonPvpMatch_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "CMoonPvpTournamentMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournament" ADD CONSTRAINT "CMoonPvpTournament_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "CMoonPvpTournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentEntry" ADD CONSTRAINT "CMoonPvpTournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "CMoonPvpTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentEntry" ADD CONSTRAINT "CMoonPvpTournamentEntry_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentEntryMember" ADD CONSTRAINT "CMoonPvpTournamentEntryMember_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CMoonPvpTournamentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentEntryMember" ADD CONSTRAINT "CMoonPvpTournamentEntryMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentMatch" ADD CONSTRAINT "CMoonPvpTournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "CMoonPvpTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentMatch" ADD CONSTRAINT "CMoonPvpTournamentMatch_entryAId_fkey" FOREIGN KEY ("entryAId") REFERENCES "CMoonPvpTournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPvpTournamentMatch" ADD CONSTRAINT "CMoonPvpTournamentMatch_entryBId_fkey" FOREIGN KEY ("entryBId") REFERENCES "CMoonPvpTournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

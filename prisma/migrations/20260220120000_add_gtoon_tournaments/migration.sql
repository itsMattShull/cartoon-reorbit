-- CreateEnum
CREATE TYPE "GtoonTournamentStatus" AS ENUM ('DRAFT', 'OPT_IN_OPEN', 'OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GtoonTournamentStage" AS ENUM ('SWISS', 'BRACKET');

-- CreateEnum
CREATE TYPE "GtoonTournamentFormat" AS ENUM ('BRACKET_8_OR_LESS', 'SWISS_THEN_TOP8');

-- CreateEnum
CREATE TYPE "GtoonTournamentMatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'BYE');

-- CreateEnum
CREATE TYPE "GtoonTournamentMatchOutcome" AS ENUM ('A_WIN', 'B_WIN', 'TIE');

-- CreateEnum
CREATE TYPE "GtoonTournamentTiebreakMethod" AS ENUM ('NONE', 'SUDDEN_DEATH', 'ADMIN_SELECT');

-- CreateEnum
CREATE TYPE "GtoonTournamentResolutionPolicy" AS ENUM ('FIRST_GAMES_AFTER_PAIRING');

-- CreateTable
CREATE TABLE "GtoonTournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "GtoonTournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "optInStartAt" TIMESTAMP(3) NOT NULL,
    "optInEndAt" TIMESTAMP(3) NOT NULL,
    "format" "GtoonTournamentFormat",
    "swissRounds" INTEGER NOT NULL DEFAULT 4,
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "maxSuddenDeathGames" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "announcementChannelId" TEXT NOT NULL,
    "lastAnnouncementAt" TIMESTAMP(3),
    "nextAnnouncementAt" TIMESTAMP(3),
    "finalOptInMidnightAnnouncementSent" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "finalPlacementsJson" JSONB,
    "winnerUserId" TEXT,
    "tournamentCompletedAt" TIMESTAMP(3),

    CONSTRAINT "GtoonTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtoonTournamentOptIn" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GtoonTournamentOptIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtoonTournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stage" "GtoonTournamentStage" NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GtoonTournamentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtoonTournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "stage" "GtoonTournamentStage" NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "tableNumber" INTEGER,
    "playerAUserId" TEXT NOT NULL,
    "playerBUserId" TEXT NOT NULL,
    "status" "GtoonTournamentMatchStatus" NOT NULL DEFAULT 'PENDING',
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "winsA" INTEGER NOT NULL DEFAULT 0,
    "winsB" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "gamesCounted" INTEGER NOT NULL DEFAULT 0,
    "outcome" "GtoonTournamentMatchOutcome",
    "winnerUserId" TEXT,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sourceBattleIdsJson" JSONB,
    "resolutionPolicy" "GtoonTournamentResolutionPolicy" NOT NULL DEFAULT 'FIRST_GAMES_AFTER_PAIRING',
    "requiresWinner" BOOLEAN NOT NULL DEFAULT false,
    "tiebreakMethod" "GtoonTournamentTiebreakMethod",
    "tiebreakResolvedAt" TIMESTAMP(3),
    "tiebreakNotes" TEXT,
    "suddenDeathGamesCounted" INTEGER NOT NULL DEFAULT 0,
    "seedA" INTEGER,
    "seedB" INTEGER,

    CONSTRAINT "GtoonTournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtoonTournamentPlayerRecord" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "swissWins" INTEGER NOT NULL DEFAULT 0,
    "swissLosses" INTEGER NOT NULL DEFAULT 0,
    "swissTies" INTEGER NOT NULL DEFAULT 0,
    "swissByes" INTEGER NOT NULL DEFAULT 0,
    "bracketWins" INTEGER NOT NULL DEFAULT 0,
    "bracketLosses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "swissGameWins" INTEGER NOT NULL DEFAULT 0,
    "swissGameLosses" INTEGER NOT NULL DEFAULT 0,
    "swissGameTies" INTEGER NOT NULL DEFAULT 0,
    "opponentMatchWinPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gameWinPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GtoonTournamentPlayerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GtoonTournament_status_idx" ON "GtoonTournament"("status");

-- CreateIndex
CREATE INDEX "GtoonTournament_optInEndAt_idx" ON "GtoonTournament"("optInEndAt");

-- CreateIndex
CREATE INDEX "GtoonTournament_optInStartAt_idx" ON "GtoonTournament"("optInStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "GtoonTournamentOptIn_tournamentId_userId_key" ON "GtoonTournamentOptIn"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "GtoonTournamentOptIn_tournamentId_isActive_idx" ON "GtoonTournamentOptIn"("tournamentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GtoonTournamentRound_tournamentId_stage_roundNumber_key" ON "GtoonTournamentRound"("tournamentId", "stage", "roundNumber");

-- CreateIndex
CREATE INDEX "GtoonTournamentRound_tournamentId_stage_idx" ON "GtoonTournamentRound"("tournamentId", "stage");

-- CreateIndex
CREATE INDEX "GtoonTournamentMatch_tournamentId_stage_roundNumber_idx" ON "GtoonTournamentMatch"("tournamentId", "stage", "roundNumber");

-- CreateIndex
CREATE INDEX "GtoonTournamentMatch_tournamentId_status_idx" ON "GtoonTournamentMatch"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "GtoonTournamentMatch_tournamentId_outcome_idx" ON "GtoonTournamentMatch"("tournamentId", "outcome");

-- CreateIndex
CREATE INDEX "GtoonTournamentMatch_playerAUserId_idx" ON "GtoonTournamentMatch"("playerAUserId");

-- CreateIndex
CREATE INDEX "GtoonTournamentMatch_playerBUserId_idx" ON "GtoonTournamentMatch"("playerBUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GtoonTournamentPlayerRecord_tournamentId_userId_key" ON "GtoonTournamentPlayerRecord"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "GtoonTournamentPlayerRecord_tournamentId_points_idx" ON "GtoonTournamentPlayerRecord"("tournamentId", "points");

-- AddForeignKey
ALTER TABLE "GtoonTournament" ADD CONSTRAINT "GtoonTournament_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentOptIn" ADD CONSTRAINT "GtoonTournamentOptIn_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentOptIn" ADD CONSTRAINT "GtoonTournamentOptIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentRound" ADD CONSTRAINT "GtoonTournamentRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentMatch" ADD CONSTRAINT "GtoonTournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentMatch" ADD CONSTRAINT "GtoonTournamentMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "GtoonTournamentRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentMatch" ADD CONSTRAINT "GtoonTournamentMatch_playerAUserId_fkey" FOREIGN KEY ("playerAUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentMatch" ADD CONSTRAINT "GtoonTournamentMatch_playerBUserId_fkey" FOREIGN KEY ("playerBUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentMatch" ADD CONSTRAINT "GtoonTournamentMatch_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentPlayerRecord" ADD CONSTRAINT "GtoonTournamentPlayerRecord_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtoonTournamentPlayerRecord" ADD CONSTRAINT "GtoonTournamentPlayerRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

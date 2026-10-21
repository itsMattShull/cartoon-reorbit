-- OG gToons tournaments: tables, enums, GameConfig switch, and OgGtoonMatch.tournamentMatchId.
--
-- OgGtoonMatch is written once per game and read by the leaderboard, so its change is kept as cheap
-- as possible: a nullable column (metadata-only), the foreign key added NOT VALID then validated
-- (every existing row is NULL, so validation is instant and does not hold a long lock), and a
-- PARTIAL index over only the tournament rows (almost every row is NULL, so the index stays tiny).
-- The new tournaments switch defaults to false: the Tournaments tab stays hidden until an admin
-- turns it on in Manage Games.

-- CreateEnum
CREATE TYPE "OgGtoonTournamentStatus" AS ENUM ('DRAFT', 'OPT_IN_OPEN', 'OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentStage" AS ENUM ('SWISS', 'BRACKET');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentFormat" AS ENUM ('BRACKET_8_OR_LESS', 'SWISS_THEN_TOP8');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentMatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'BYE');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentMatchOutcome" AS ENUM ('A_WIN', 'B_WIN', 'TIE');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentResolution" AS ENUM ('PLAYED', 'FORFEIT', 'WALKOVER', 'DEADLINE', 'ADMIN');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentPrizeTier" AS ENUM ('FIRST', 'TOP8');

-- CreateEnum
CREATE TYPE "OgGtoonTournamentPrizeStatus" AS ENUM ('PENDING_APPROVAL', 'PENDING', 'PAID', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "ogGtoonsTournamentsEnabled" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "OgGtoonMatch" ADD COLUMN     "tournamentMatchId" TEXT;

-- CreateTable
CREATE TABLE "OgGtoonTournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "OgGtoonTournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "optInStartAt" TIMESTAMP(3) NOT NULL,
    "optInEndAt" TIMESTAMP(3) NOT NULL,
    "format" "OgGtoonTournamentFormat",
    "swissRoundsOverride" INTEGER,
    "swissRoundsPlanned" INTEGER,
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "maxExtraGames" INTEGER NOT NULL DEFAULT 4,
    "roundWindowHours" INTEGER NOT NULL DEFAULT 72,
    "firstPrizeJson" JSONB,
    "top8PrizeJson" JSONB,
    "minEntrantsTop8Prize" INTEGER NOT NULL DEFAULT 9,
    "requirePrizeApproval" BOOLEAN NOT NULL DEFAULT true,
    "prizesQueuedAt" TIMESTAMP(3),
    "prizesApprovedAt" TIMESTAMP(3),
    "prizesApprovedById" TEXT,
    "seedValue" TEXT,
    "announcementChannelId" TEXT NOT NULL,
    "lastAnnouncementAt" TIMESTAMP(3),
    "nextAnnouncementAt" TIMESTAMP(3),
    "finalOptInMidnightAnnouncementSent" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "finalPlacementsJson" JSONB,
    "winnerUserId" TEXT,
    "tournamentCompletedAt" TIMESTAMP(3),
    "lastAdvancedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OgGtoonTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonTournamentOptIn" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceDeckId" TEXT,
    "deckSnapshotJson" JSONB NOT NULL,
    "repairCount" INTEGER NOT NULL DEFAULT 0,
    "lastRepairedAt" TIMESTAMP(3),
    "disqualified" BOOLEAN NOT NULL DEFAULT false,
    "disqualifiedNote" TEXT,

    CONSTRAINT "OgGtoonTournamentOptIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonTournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stage" "OgGtoonTournamentStage" NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),

    CONSTRAINT "OgGtoonTournamentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonTournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "stage" "OgGtoonTournamentStage" NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "tableNumber" INTEGER,
    "playerAUserId" TEXT NOT NULL,
    "playerBUserId" TEXT NOT NULL,
    "status" "OgGtoonTournamentMatchStatus" NOT NULL DEFAULT 'PENDING',
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "winsA" INTEGER NOT NULL DEFAULT 0,
    "winsB" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "gamesCounted" INTEGER NOT NULL DEFAULT 0,
    "outcome" "OgGtoonTournamentMatchOutcome",
    "winnerUserId" TEXT,
    "resolution" "OgGtoonTournamentResolution",
    "requiresWinner" BOOLEAN NOT NULL DEFAULT false,
    "seedA" INTEGER,
    "seedB" INTEGER,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "readyAAt" TIMESTAMP(3),
    "readyBAt" TIMESTAMP(3),
    "firstReadyAt" TIMESTAMP(3),
    "liveMatchId" TEXT,
    "liveStartedAt" TIMESTAMP(3),
    "voidedGames" INTEGER NOT NULL DEFAULT 0,
    "extraGamesCounted" INTEGER NOT NULL DEFAULT 0,
    "needsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "needsAdminReason" TEXT,
    "adminNotes" TEXT,
    "reminder24SentAt" TIMESTAMP(3),
    "reminder4SentAt" TIMESTAMP(3),

    CONSTRAINT "OgGtoonTournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonTournamentPlayerRecord" (
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

    CONSTRAINT "OgGtoonTournamentPlayerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonTournamentPrizeGrant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "OgGtoonTournamentPrizeTier" NOT NULL,
    "place" INTEGER NOT NULL,
    "status" "OgGtoonTournamentPrizeStatus" NOT NULL DEFAULT 'PENDING',
    "rewardJson" JSONB NOT NULL,
    "summaryJson" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedAt" TIMESTAMP(3),

    CONSTRAINT "OgGtoonTournamentPrizeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OgGtoonTournament_status_idx" ON "OgGtoonTournament"("status");

-- CreateIndex
CREATE INDEX "OgGtoonTournament_optInStartAt_idx" ON "OgGtoonTournament"("optInStartAt");

-- CreateIndex
CREATE INDEX "OgGtoonTournament_optInEndAt_idx" ON "OgGtoonTournament"("optInEndAt");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentOptIn_tournamentId_isActive_idx" ON "OgGtoonTournamentOptIn"("tournamentId", "isActive");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentOptIn_userId_idx" ON "OgGtoonTournamentOptIn"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OgGtoonTournamentOptIn_tournamentId_userId_key" ON "OgGtoonTournamentOptIn"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentRound_tournamentId_stage_idx" ON "OgGtoonTournamentRound"("tournamentId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "OgGtoonTournamentRound_tournamentId_stage_roundNumber_key" ON "OgGtoonTournamentRound"("tournamentId", "stage", "roundNumber");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentMatch_tournamentId_stage_roundNumber_idx" ON "OgGtoonTournamentMatch"("tournamentId", "stage", "roundNumber");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentMatch_tournamentId_status_idx" ON "OgGtoonTournamentMatch"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentMatch_status_dueAt_idx" ON "OgGtoonTournamentMatch"("status", "dueAt");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentMatch_playerAUserId_idx" ON "OgGtoonTournamentMatch"("playerAUserId");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentMatch_playerBUserId_idx" ON "OgGtoonTournamentMatch"("playerBUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OgGtoonTournamentMatch_roundId_tableNumber_key" ON "OgGtoonTournamentMatch"("roundId", "tableNumber");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentPlayerRecord_tournamentId_points_idx" ON "OgGtoonTournamentPlayerRecord"("tournamentId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "OgGtoonTournamentPlayerRecord_tournamentId_userId_key" ON "OgGtoonTournamentPlayerRecord"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "OgGtoonTournamentPrizeGrant_tournamentId_status_idx" ON "OgGtoonTournamentPrizeGrant"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OgGtoonTournamentPrizeGrant_tournamentId_userId_key" ON "OgGtoonTournamentPrizeGrant"("tournamentId", "userId");

-- AddForeignKey


-- AddForeignKey
ALTER TABLE "OgGtoonTournament" ADD CONSTRAINT "OgGtoonTournament_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentOptIn" ADD CONSTRAINT "OgGtoonTournamentOptIn_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "OgGtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentOptIn" ADD CONSTRAINT "OgGtoonTournamentOptIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentRound" ADD CONSTRAINT "OgGtoonTournamentRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "OgGtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentMatch" ADD CONSTRAINT "OgGtoonTournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "OgGtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentMatch" ADD CONSTRAINT "OgGtoonTournamentMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OgGtoonTournamentRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentMatch" ADD CONSTRAINT "OgGtoonTournamentMatch_playerAUserId_fkey" FOREIGN KEY ("playerAUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentMatch" ADD CONSTRAINT "OgGtoonTournamentMatch_playerBUserId_fkey" FOREIGN KEY ("playerBUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentMatch" ADD CONSTRAINT "OgGtoonTournamentMatch_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentPlayerRecord" ADD CONSTRAINT "OgGtoonTournamentPlayerRecord_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "OgGtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentPlayerRecord" ADD CONSTRAINT "OgGtoonTournamentPlayerRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentPrizeGrant" ADD CONSTRAINT "OgGtoonTournamentPrizeGrant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "OgGtoonTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonTournamentPrizeGrant" ADD CONSTRAINT "OgGtoonTournamentPrizeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OgGtoonMatch -> tournament pairing (see header comment)
ALTER TABLE "OgGtoonMatch" ADD CONSTRAINT "OgGtoonMatch_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "OgGtoonTournamentMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OgGtoonMatch" VALIDATE CONSTRAINT "OgGtoonMatch_tournamentMatchId_fkey";
CREATE INDEX "OgGtoonMatch_tournamentMatchId_idx" ON "OgGtoonMatch"("tournamentMatchId") WHERE "tournamentMatchId" IS NOT NULL;

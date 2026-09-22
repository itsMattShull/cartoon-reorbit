/*
  Warnings:

  - You are about to drop the column `favoriteShows` on the `SurveyAnswers` table. All the data in the column will be lost.
  - You are about to drop the column `favoriteShowsLen` on the `SurveyAnswers` table. All the data in the column will be lost.
  - You are about to drop the column `favoriteShowsVec` on the `SurveyAnswers` table. All the data in the column will be lost.
  - Added the required column `lockShows` to the `SurveyAnswers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lockShowsLen` to the `SurveyAnswers` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GtoonColor" AS ENUM ('BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK');

-- CreateEnum
CREATE TYPE "OgGtoonMatchOutcome" AS ENUM ('PLAYER1', 'PLAYER2', 'TIE', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "CMoonDispersalOfferStatus" AS ENUM ('OPEN', 'CLOSED');

-- DropForeignKey
ALTER TABLE "EdRpsMatch" DROP CONSTRAINT "EdRpsMatch_player2UserId_fkey";

-- DropIndex
DROP INDEX "Notification_userId_createdAt_idx";

-- DropIndex
DROP INDEX "loackedPoints_userId_status_amount_idx";

-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "gtoonColor" "GtoonColor",
ADD COLUMN     "gtoonEffect" JSONB,
ADD COLUMN     "gtoonValue" INTEGER,
ADD COLUMN     "isOgGtoon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSlamGtoon" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SurveyAnswers" DROP COLUMN "favoriteShows",
DROP COLUMN "favoriteShowsLen",
DROP COLUMN "favoriteShowsVec",
ADD COLUMN     "lockShows" TEXT NOT NULL,
ADD COLUMN     "lockShowsLen" INTEGER NOT NULL,
ADD COLUMN     "lockShowsVec" JSONB;

-- CreateTable
CREATE TABLE "OgGtoonMatch" (
    "id" TEXT NOT NULL,
    "player1UserId" TEXT NOT NULL,
    "player2UserId" TEXT NOT NULL,
    "player1Points" INTEGER NOT NULL DEFAULT 0,
    "player2Points" INTEGER NOT NULL DEFAULT 0,
    "player1DeckSnapshot" JSONB NOT NULL,
    "player2DeckSnapshot" JSONB NOT NULL,
    "player1GoalColor" "GtoonColor" NOT NULL,
    "player2GoalColor" "GtoonColor" NOT NULL,
    "player1SwapUsed" BOOLEAN NOT NULL DEFAULT false,
    "player2SwapUsed" BOOLEAN NOT NULL DEFAULT false,
    "player1Score" INTEGER NOT NULL DEFAULT 0,
    "player2Score" INTEGER NOT NULL DEFAULT 0,
    "roundLog" JSONB NOT NULL,
    "isChallenge" BOOLEAN NOT NULL DEFAULT false,
    "winnerUserId" TEXT,
    "outcome" "OgGtoonMatchOutcome",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "whoLeftUserId" TEXT,

    CONSTRAINT "OgGtoonMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OgGtoonDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OgGtoonDeckCard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "OgGtoonDeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonDispersalOffer" (
    "id" TEXT NOT NULL,
    "quantityPerMember" INTEGER NOT NULL,
    "status" "CMoonDispersalOfferStatus" NOT NULL DEFAULT 'OPEN',
    "initiatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CMoonDispersalOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonDispersalOfferCMoon" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,

    CONSTRAINT "CMoonDispersalOfferCMoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonDispersalOption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CMoonDispersalOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonDispersalClaim" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonDispersalClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OgGtoonMatch_player1UserId_startedAt_idx" ON "OgGtoonMatch"("player1UserId", "startedAt");

-- CreateIndex
CREATE INDEX "OgGtoonMatch_player2UserId_startedAt_idx" ON "OgGtoonMatch"("player2UserId", "startedAt");

-- CreateIndex
CREATE INDEX "OgGtoonMatch_winnerUserId_idx" ON "OgGtoonMatch"("winnerUserId");

-- CreateIndex
CREATE INDEX "OgGtoonMatch_outcome_startedAt_idx" ON "OgGtoonMatch"("outcome", "startedAt");

-- CreateIndex
CREATE INDEX "OgGtoonDeck_userId_idx" ON "OgGtoonDeck"("userId");

-- CreateIndex
CREATE INDEX "OgGtoonDeckCard_ctoonId_idx" ON "OgGtoonDeckCard"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "OgGtoonDeckCard_deckId_position_key" ON "OgGtoonDeckCard"("deckId", "position");

-- CreateIndex
CREATE INDEX "CMoonDispersalOffer_status_createdAt_idx" ON "CMoonDispersalOffer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CMoonDispersalOfferCMoon_cMoonId_idx" ON "CMoonDispersalOfferCMoon"("cMoonId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonDispersalOfferCMoon_offerId_cMoonId_key" ON "CMoonDispersalOfferCMoon"("offerId", "cMoonId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonDispersalOption_offerId_ctoonId_key" ON "CMoonDispersalOption"("offerId", "ctoonId");

-- CreateIndex
CREATE INDEX "CMoonDispersalClaim_offerId_idx" ON "CMoonDispersalClaim"("offerId");

-- CreateIndex
CREATE INDEX "CMoonDispersalClaim_userId_idx" ON "CMoonDispersalClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonDispersalClaim_offerId_userId_key" ON "CMoonDispersalClaim"("offerId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "OgGtoonMatch" ADD CONSTRAINT "OgGtoonMatch_player1UserId_fkey" FOREIGN KEY ("player1UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonMatch" ADD CONSTRAINT "OgGtoonMatch_player2UserId_fkey" FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonMatch" ADD CONSTRAINT "OgGtoonMatch_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonMatch" ADD CONSTRAINT "OgGtoonMatch_whoLeftUserId_fkey" FOREIGN KEY ("whoLeftUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdRpsMatch" ADD CONSTRAINT "EdRpsMatch_player2UserId_fkey" FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonDeck" ADD CONSTRAINT "OgGtoonDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonDeckCard" ADD CONSTRAINT "OgGtoonDeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "OgGtoonDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OgGtoonDeckCard" ADD CONSTRAINT "OgGtoonDeckCard_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalOffer" ADD CONSTRAINT "CMoonDispersalOffer_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalOffer" ADD CONSTRAINT "CMoonDispersalOffer_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalOfferCMoon" ADD CONSTRAINT "CMoonDispersalOfferCMoon_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CMoonDispersalOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalOfferCMoon" ADD CONSTRAINT "CMoonDispersalOfferCMoon_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalOption" ADD CONSTRAINT "CMoonDispersalOption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CMoonDispersalOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalOption" ADD CONSTRAINT "CMoonDispersalOption_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CMoonDispersalOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CMoonDispersalOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

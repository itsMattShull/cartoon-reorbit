-- AlterTable: add tkoWinsGte to Achievement
ALTER TABLE "Achievement" ADD COLUMN "tkoWinsGte" INTEGER;

-- CreateTable: TkoMatch
CREATE TABLE "TkoMatch" (
    "id" TEXT NOT NULL,
    "externalMatchId" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,
    "battleCode" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "isTraining" BOOLEAN NOT NULL DEFAULT false,
    "isChallenge" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TkoMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TkoRound
CREATE TABLE "TkoRound" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "bestOf" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "winnerUserId" TEXT,
    "winnerUsername" TEXT NOT NULL,
    "winnerReorbitId" TEXT NOT NULL,
    "winnerCharacterId" INTEGER NOT NULL,
    "winnerCharacterName" TEXT NOT NULL,
    "winnerRemainingHealth" INTEGER NOT NULL,
    "loserUserId" TEXT,
    "loserUsername" TEXT NOT NULL,
    "loserReorbitId" TEXT NOT NULL,
    "loserCharacterId" INTEGER NOT NULL,
    "loserCharacterName" TEXT NOT NULL,
    "loserRemainingHealth" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "winType" TEXT NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "disconnect" BOOLEAN NOT NULL DEFAULT false,
    "forfeit" BOOLEAN NOT NULL DEFAULT false,
    "timeout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TkoRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TkoMatch_externalMatchId_key" ON "TkoMatch"("externalMatchId");
CREATE INDEX "TkoMatch_externalMatchId_idx" ON "TkoMatch"("externalMatchId");
CREATE INDEX "TkoMatch_createdAt_idx" ON "TkoMatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TkoRound_eventId_key" ON "TkoRound"("eventId");
CREATE INDEX "TkoRound_matchId_idx" ON "TkoRound"("matchId");
CREATE INDEX "TkoRound_winnerUserId_counted_idx" ON "TkoRound"("winnerUserId", "counted");
CREATE INDEX "TkoRound_loserUserId_idx" ON "TkoRound"("loserUserId");
CREATE INDEX "TkoRound_createdAt_idx" ON "TkoRound"("createdAt");

-- AddForeignKey
ALTER TABLE "TkoRound" ADD CONSTRAINT "TkoRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TkoMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TkoRound" ADD CONSTRAINT "TkoRound_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TkoRound" ADD CONSTRAINT "TkoRound_loserUserId_fkey" FOREIGN KEY ("loserUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

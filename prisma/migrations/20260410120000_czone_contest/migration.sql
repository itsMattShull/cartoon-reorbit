-- CreateTable
CREATE TABLE "CZoneContest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "maxVotesPerUser" INTEGER NOT NULL DEFAULT 5,
    "winnerPrizes" JSONB NOT NULL DEFAULT '{"ctoons":[],"backgroundIds":[],"points":0}',
    "participantPrizes" JSONB NOT NULL DEFAULT '{"ctoons":[],"backgroundIds":[],"points":0}',
    "winnerId" TEXT,
    "distributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CZoneContest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CZoneContestSubmission" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneIndex" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneContestSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CZoneContestVote" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneContestVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CZoneContestSubmission_contestId_userId_key" ON "CZoneContestSubmission"("contestId", "userId");

-- CreateIndex
CREATE INDEX "CZoneContestSubmission_contestId_idx" ON "CZoneContestSubmission"("contestId");

-- CreateIndex
CREATE INDEX "CZoneContestSubmission_userId_idx" ON "CZoneContestSubmission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CZoneContestVote_submissionId_userId_key" ON "CZoneContestVote"("submissionId", "userId");

-- CreateIndex
CREATE INDEX "CZoneContestVote_submissionId_idx" ON "CZoneContestVote"("submissionId");

-- CreateIndex
CREATE INDEX "CZoneContestVote_userId_idx" ON "CZoneContestVote"("userId");

-- AddForeignKey
ALTER TABLE "CZoneContestSubmission" ADD CONSTRAINT "CZoneContestSubmission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "CZoneContest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneContestSubmission" ADD CONSTRAINT "CZoneContestSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneContestVote" ADD CONSTRAINT "CZoneContestVote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CZoneContestSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CZoneContestVote" ADD CONSTRAINT "CZoneContestVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

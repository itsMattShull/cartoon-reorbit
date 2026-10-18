-- CreateTable
CREATE TABLE "DissolveMisfireLog" (
    "id" TEXT NOT NULL,
    "userCtoonId" TEXT,
    "ctoonId" TEXT,
    "ctoonName" TEXT,
    "mintNumber" INTEGER,
    "rightfulOwnerUserId" TEXT,
    "rightfulOwnerUsername" TEXT,
    "rightfulOwnerSince" TIMESTAMP(3),
    "rightfulOwnerMethod" TEXT,
    "source" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "bogusAuctionId" TEXT,
    "wrongWinnerUserId" TEXT,
    "wrongWinnerUsername" TEXT,
    "wrongWinnerPaidPoints" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedByUsername" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "DissolveMisfireLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DissolveMisfireLog_detectedAt_idx" ON "DissolveMisfireLog"("detectedAt");

-- CreateIndex
CREATE INDEX "DissolveMisfireLog_reviewedAt_idx" ON "DissolveMisfireLog"("reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DissolveMisfireLog_bogusAuctionId_key" ON "DissolveMisfireLog"("bogusAuctionId");

-- Errors thrown while launching a dissolve-queue entry into a live auction
-- (server/workers/dissolve-auction-launch.worker.js) were previously
-- silently swallowed with zero trace. This gives the "Manage Dissolve Queue"
-- admin page's Errors modal a durable log to read from.
CREATE TABLE "DissolveAuctionErrorLog" (
    "id" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "userCtoonId" TEXT,
    "ctoonName" TEXT,
    "mintNumber" INTEGER,
    "rarity" TEXT,
    "series" TEXT,
    "set" TEXT,
    "sourceUsername" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DissolveAuctionErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DissolveAuctionErrorLog_createdAt_idx" ON "DissolveAuctionErrorLog"("createdAt");

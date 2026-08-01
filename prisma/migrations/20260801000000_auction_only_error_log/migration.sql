-- Scheduling (admin create/edit) and activation (cron go-live) errors for
-- AuctionOnly were previously either surfaced as a raw 500 response or
-- silently swallowed with zero trace. This gives the "Manage Auction Only"
-- admin page a durable log to read from.
CREATE TABLE "AuctionOnlyErrorLog" (
    "id" TEXT NOT NULL,
    "auctionOnlyId" TEXT,
    "context" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionOnlyErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuctionOnlyErrorLog_createdAt_idx" ON "AuctionOnlyErrorLog"("createdAt");

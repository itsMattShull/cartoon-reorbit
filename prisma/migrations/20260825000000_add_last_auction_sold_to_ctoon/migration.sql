-- Snapshot columns for the most recent real auction sale of each cToon,
-- maintained at write time by server/socket-server.js's auction-close
-- settlement. Backfill with prisma/backfillLastAuctionSold.js after this
-- migration runs.
ALTER TABLE "Ctoon" ADD COLUMN IF NOT EXISTS "lastAuctionSoldPrice" INTEGER;
ALTER TABLE "Ctoon" ADD COLUMN IF NOT EXISTS "lastAuctionSoldAt" TIMESTAMP(3);

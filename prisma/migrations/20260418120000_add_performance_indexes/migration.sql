-- Performance indexes for UserCtoon (high-volume queries at 500+ users × 3000+ cToons)
CREATE INDEX IF NOT EXISTS "UserCtoon_userId_idx" ON "UserCtoon"("userId");
CREATE INDEX IF NOT EXISTS "UserCtoon_userId_burnedAt_idx" ON "UserCtoon"("userId", "burnedAt");
CREATE INDEX IF NOT EXISTS "UserCtoon_userId_ctoonId_idx" ON "UserCtoon"("userId", "ctoonId");
CREATE INDEX IF NOT EXISTS "UserCtoon_userId_isTradeable_burnedAt_idx" ON "UserCtoon"("userId", "isTradeable", "burnedAt");

-- Performance index for Auction stats queries (modal avg/median calculations)
CREATE INDEX IF NOT EXISTS "Auction_status_winnerId_idx" ON "Auction"("status", "winnerId");

-- CreateIndex
-- Lets MAX("createdAt") WHERE "userId" = X (used by recomputeLastActivity in
-- server/cron/sync-guild-members.js) be answered with one index probe instead of reading
-- every one of the user's entries through the (userId, direction|gameName, createdAt) indexes.
--
-- IF NOT EXISTS: these were built ahead of time in production with
--   CREATE INDEX CONCURRENTLY ... (so inserts into these hot tables aren't blocked during
--   the build); this migration is then a no-op there and creates them elsewhere.
CREATE INDEX IF NOT EXISTS "GamePointLog_userId_createdAt_idx" ON "GamePointLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PointsLog_userId_createdAt_idx" ON "PointsLog"("userId", "createdAt");

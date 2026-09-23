-- Backs recomputeLastActivity's per-user "MAX(createdAt) WHERE userId = ..." lookups
-- (server/cron/sync-guild-members.js). Neither table had a userId index before, so
-- that correlated subquery fell back to a full scan of Visit/LoginLog for every row
-- of User, making the UPDATE slow enough to widen its lock-holding window against
-- concurrent writers.
-- CreateIndex
CREATE INDEX "Visit_userId_createdAt_idx" ON "Visit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginLog_userId_createdAt_idx" ON "LoginLog"("userId", "createdAt");

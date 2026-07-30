-- Composite index to speed up daily-cap aggregate queries on GamePointLog
CREATE INDEX IF NOT EXISTS "GamePointLog_userId_gameName_createdAt_idx" ON "GamePointLog"("userId", "gameName", "createdAt");

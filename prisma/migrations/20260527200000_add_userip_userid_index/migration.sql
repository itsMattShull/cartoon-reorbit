-- Add index on UserIP(userId) for faster per-user lookups
CREATE INDEX IF NOT EXISTS "UserIP_userId_idx" ON "UserIP"("userId");

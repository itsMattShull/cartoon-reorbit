-- Indexes required by the Alt Account Investigator. Each one also fixes a
-- sequential scan that already exists in production today.

-- LoginLog only had [ip] and [createdAt]. Every "which IPs did this user log in
-- from" lookup was a seq scan, and server/middleware/login-log.js runs a
-- (userId, ip, createdAt) findFirst on EVERY non-hot-path request — it was
-- riding LoginLog_ip_idx, which degrades exactly when an IP is shared (CGNAT,
-- a school, a VPN exit), i.e. precisely the population being investigated.
CREATE INDEX IF NOT EXISTS "LoginLog_userId_createdAt_idx" ON "LoginLog"("userId", "createdAt");

-- UserIP had [userId] and unique(userId, ip), both leading with userId, so the
-- reverse lookup ("who else ever used this IP") was a seq scan.
CREATE INDEX IF NOT EXISTS "UserIP_ip_idx" ON "UserIP"("ip");

-- Bid had NO indexes beyond its primary key. Any bidder-overlap query, and
-- server/utils/suspiciousActivityMetrics.js:293, scan the whole table.
CREATE INDEX IF NOT EXISTS "Bid_userId_createdAt_idx" ON "Bid"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Bid_auctionId_idx" ON "Bid"("auctionId");

-- Visit had NO indexes at all, and server/api/points/visit.post.js counts by
-- userId on every single cZone visit.
CREATE INDEX IF NOT EXISTS "Visit_userId_createdAt_idx" ON "Visit"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Visit_zoneOwnerId_createdAt_idx" ON "Visit"("zoneOwnerId", "createdAt");

-- CtoonOwnerLog indexed [userId, createdAt] but not counterpartyUserId, so
-- "what flowed to/from this account" only worked in one direction.
CREATE INDEX IF NOT EXISTS "CtoonOwnerLog_counterpartyUserId_createdAt_idx"
  ON "CtoonOwnerLog"("counterpartyUserId", "createdAt");

-- NOTE: barcode-scan overlap (the most VPN-resistant signal in the tool) needs
-- no new index — UserBarcodeScan and UserScan both already carry
-- @@index([mappingId]), which is what the reverse lookup joins on.

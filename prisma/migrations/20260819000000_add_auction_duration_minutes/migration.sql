-- Custom auction durations: exact listed length, and an index for the listing sort.
--
-- Written idempotently to match the house style of the surrounding migrations.

-- ── Lock safety ──────────────────────────────────────────────────────────────
-- Both statements below take ACCESS EXCLUSIVE on "Auction". The ADD COLUMN is
-- catalog-only on PG11+ (nullable, no default = no table rewrite), so it is
-- instant *once it has the lock* -- but /api/auctions still fetches every ACTIVE
-- auction unpaginated, and a slow instance of that query makes the ALTER wait
-- while every subsequent query on the table queues behind it. Failing fast and
-- retrying beats stalling the auction house.
SET lock_timeout = '3s';

-- Exact listed length in minutes.
--
-- endAt - createdAt is not a substitute: server/socket-server.js extends endAt
-- by the full downtime after an outage, so the delta overstates the listed
-- length for any auction caught in that window. Nullable, so existing rows and
-- the admin/worker creation paths simply read as "unknown" and fall back.
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;

-- The Auction House's default tab filters on status and orders by endAt, and
-- the ending-soon Discord notifier runs the same shape once a minute. Neither
-- had an index that covered the ordering. This matters more as durations get
-- longer, because the active set scales with mean duration.
CREATE INDEX IF NOT EXISTS "Auction_status_endAt_idx" ON "Auction" ("status", "endAt");

RESET lock_timeout;

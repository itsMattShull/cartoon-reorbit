-- Tracks when a mod manually rescheduled a DissolveAuctionQueue entry
-- (set by [id].patch.js). Non-null rows are excluded from the bulk
-- applyDissolveSchedule recompute unless the caller explicitly opts in
-- with includePinned. No index: the table is small and the only query
-- shape that filters on it (reschedule=true bulk recompute) already
-- scans the whole table, so a standalone index would only add write
-- overhead with no read benefit.
ALTER TABLE "DissolveAuctionQueue" ADD COLUMN "pinnedAt" TIMESTAMP(3);

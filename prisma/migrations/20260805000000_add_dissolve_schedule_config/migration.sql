-- Persisted default cadence for scheduling DissolveAuctionQueue entries, so the
-- automatic 9-month inactivity dissolve cron can schedule newly-queued priority
-- entries without requiring an admin to manually apply a schedule first.
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "dissolveScheduleCadenceDays"        INTEGER DEFAULT 7;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "dissolveScheduleFeaturedPerCadence" INTEGER DEFAULT 2;
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "dissolveScheduleOtherPerCadence"    INTEGER DEFAULT 10;

-- Precomputed count of distinct CZones displaying a given cToon, maintained
-- by server/cron/czone-display-count.js. Backfill with
-- prisma/backfillCzoneDisplayCount.js after this migration runs.
ALTER TABLE "Ctoon" ADD COLUMN IF NOT EXISTS "czoneDisplayCount" INTEGER NOT NULL DEFAULT 0;

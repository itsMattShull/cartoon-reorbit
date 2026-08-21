-- Add the optional poster-art path for the cMoon selection modal.
--
-- Nullable with no default, so this is a metadata-only catalog change on PG 11+: no table
-- rewrite. Still needs ACCESS EXCLUSIVE for the catalog update; "CMoon" has at most a handful
-- of rows (the product assumes 4 total), so lock_timeout is a formality here rather than the
-- real safeguard it is on a hot table.
SET LOCAL lock_timeout = '3s';

ALTER TABLE "CMoon" ADD COLUMN IF NOT EXISTS "imagePath" TEXT;

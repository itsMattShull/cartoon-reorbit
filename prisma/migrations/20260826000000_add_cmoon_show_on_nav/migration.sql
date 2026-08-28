-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "showOnNav" BOOLEAN NOT NULL DEFAULT true;

-- Preserve the existing invariant that a locked cMoon stays out of self-serve public surfaces
-- unless an admin explicitly opts it back in. Without this backfill, every already-locked cMoon
-- would default to true and immediately appear on the new public cMoon navigation page.
UPDATE "CMoon" SET "showOnNav" = false WHERE "joinLocked" = true;

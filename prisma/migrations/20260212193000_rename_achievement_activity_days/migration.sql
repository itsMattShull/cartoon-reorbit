-- Rename column for cumulative activity days
ALTER TABLE "Achievement" RENAME COLUMN "consecutiveActiveDaysGte" TO "cumulativeActiveDaysGte";

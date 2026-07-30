-- Economy page: sort/filter controls on "Browse All cToons".

-- Trade activity that couldn't be priced (no cToon in the trade had a known
-- reference value) was previously dropped entirely, volume included, which
-- biased any "most traded" ranking toward cToons that already had auction or
-- cMart pricing. Volume is now always recorded; avgPrice is NULL when the day's
-- activity had no basis to impute a price from.
ALTER TABLE "CtoonPriceDaily" ALTER COLUMN "avgPrice" DROP NOT NULL;

-- Trending filters on "date" with no "source" predicate, so
-- CtoonPriceDaily_source_date_ctoonId_idx cannot serve it and it seq-scans the
-- whole table on every cold cache. Trailing "volume" keeps the scan index-only.
CREATE INDEX IF NOT EXISTS "CtoonPriceDaily_date_ctoonId_volume_idx"
  ON "CtoonPriceDaily"("date", "ctoonId", "volume");

-- The "Most Traded"/"Most Auctioned" browse sorts aggregate SUM(volume) per
-- cToon across all dates for one source. Leading on source and grouping by
-- ctoonId lets Postgres GroupAggregate straight off the index with no heap
-- fetches and no sort.
CREATE INDEX IF NOT EXISTS "CtoonPriceDaily_source_ctoonId_volume_idx"
  ON "CtoonPriceDaily"("source", "ctoonId", "volume");

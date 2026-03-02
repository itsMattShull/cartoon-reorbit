-- CreateIndex
-- Composite index on (startAt, endAt) so the "find active searches" query
-- (WHERE startAt <= now AND endAt >= now) can be satisfied with a single
-- index scan instead of two separate single-column index scans.
CREATE INDEX "CZoneSearch_startAt_endAt_idx" ON "CZoneSearch"("startAt", "endAt");

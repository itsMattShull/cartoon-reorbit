-- Supports the date-ranged aggregate scans over PointsLog used by the Economy
-- page (net points issued, inflation rates) and the admin analytics charts.
CREATE INDEX IF NOT EXISTS "PointsLog_createdAt_idx" ON "PointsLog"("createdAt");

// server/utils/pointsCategoryBreakdown.js
import { prisma } from '@/server/prisma'
import { transferExclusionSql, categoryLabel } from './pointsLogCategories'

const TF_DAYS   = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
const TF_WEEKS  = { '1m': 4,  '3m': 13, '6m': 26,  '1y': 52 }
const TF_MONTHS = { '1m': 1,  '3m': 3,  '6m': 6,   '1y': 12 }

// Series shown individually before the rest get rolled into "Other" — keeps
// the stacked bar legible instead of growing one series per PointsLog method.
const MAX_CATEGORIES = 7

const EXCLUSION_SQL = transferExclusionSql()

/**
 * Groups PointsLog rows for `direction` ('increase' or 'decrease') into a
 * per-period, per-category matrix for the admin analytics "Points Issued by
 * Category" / "Points Spent by Category" stacked bar charts. Mirrors the
 * period bucketing in net-points-issues.get.js so the x-axis lines up with
 * the Net Points Issued chart, and excludes the same balanced-transfer
 * methods (trades, auctions, dissolves, admin corrections) that chart does.
 */
export async function computeCategoryBreakdown({ direction, timeframe = '3m', groupBy = 'daily' }) {
  const days   = TF_DAYS[timeframe]   ?? 90
  const weeks  = TF_WEEKS[timeframe]  ?? 13
  const months = TF_MONTHS[timeframe] ?? 3

  let rows, meta
  if (groupBy === 'weekly') {
    rows = await prisma.$queryRawUnsafe(`
      WITH
        bounds AS (
          SELECT date_trunc('week', now()::date) AS end_wk,
                 date_trunc('week', now()::date) - INTERVAL '${weeks - 1} week' AS start_wk
        ),
        week_series AS (
          SELECT generate_series((SELECT start_wk FROM bounds),
                                 (SELECT end_wk   FROM bounds),
                                 '1 week')::date AS period
        ),
        agg AS (
          SELECT
            date_trunc('week', "createdAt")::date AS period,
            "method",
            SUM("points")::bigint AS total
          FROM "PointsLog"
          WHERE "direction" = '${direction}'
            AND "createdAt" >= (SELECT start_wk FROM bounds)
            AND "createdAt" <  (SELECT end_wk   FROM bounds) + INTERVAL '1 week'
            AND ${EXCLUSION_SQL}
          GROUP BY 1, 2
        )
      SELECT ws.period, a.method, COALESCE(a.total, 0) AS total
      FROM week_series ws
      LEFT JOIN agg a ON a.period = ws.period
      ORDER BY ws.period;
    `)
    meta = { timeframe, weeks }
  } else if (groupBy === 'monthly') {
    rows = await prisma.$queryRawUnsafe(`
      WITH
        bounds AS (
          SELECT date_trunc('month', now()::date) AS end_mo,
                 date_trunc('month', now()::date) - INTERVAL '${months - 1} month' AS start_mo
        ),
        month_series AS (
          SELECT generate_series((SELECT start_mo FROM bounds),
                                 (SELECT end_mo   FROM bounds),
                                 '1 month')::date AS period
        ),
        agg AS (
          SELECT
            date_trunc('month', "createdAt")::date AS period,
            "method",
            SUM("points")::bigint AS total
          FROM "PointsLog"
          WHERE "direction" = '${direction}'
            AND "createdAt" >= (SELECT start_mo FROM bounds)
            AND "createdAt" <  (SELECT end_mo   FROM bounds) + INTERVAL '1 month'
            AND ${EXCLUSION_SQL}
          GROUP BY 1, 2
        )
      SELECT ms.period, a.method, COALESCE(a.total, 0) AS total
      FROM month_series ms
      LEFT JOIN agg a ON a.period = ms.period
      ORDER BY ms.period;
    `)
    meta = { timeframe, months }
  } else {
    rows = await prisma.$queryRawUnsafe(`
      WITH
        bounds AS (
          SELECT (now() - INTERVAL '${days} days')::date AS start_day,
                 now()::date                            AS end_day
        ),
        day_series AS (
          SELECT generate_series((SELECT start_day FROM bounds),
                                 (SELECT end_day   FROM bounds),
                                 '1 day')::date AS period
        ),
        agg AS (
          SELECT
            date_trunc('day', "createdAt")::date AS period,
            "method",
            SUM("points")::bigint AS total
          FROM "PointsLog"
          WHERE "direction" = '${direction}'
            AND "createdAt" >= (SELECT start_day FROM bounds)
            AND "createdAt" <  (SELECT end_day   FROM bounds) + INTERVAL '1 day'
            AND ${EXCLUSION_SQL}
          GROUP BY 1, 2
        )
      SELECT ds.period, a.method, COALESCE(a.total, 0) AS total
      FROM day_series ds
      LEFT JOIN agg a ON a.period = ds.period
      ORDER BY ds.period;
    `)
    meta = { timeframe, days }
  }

  // Bucket raw methods into display categories and total each across the
  // whole window so the busiest few can be shown individually.
  const periods = []
  const periodIndex = new Map()
  const categoryTotals = new Map()

  for (const row of rows) {
    const periodStr = row.period instanceof Date ? row.period.toISOString().slice(0, 10) : String(row.period)
    if (!periodIndex.has(periodStr)) {
      periodIndex.set(periodStr, periods.length)
      periods.push({ period: periodStr })
    }
    // LEFT JOIN filler row for a period with no matching activity at all.
    if (row.method == null && Number(row.total) === 0) continue

    const label = categoryLabel(row.method)
    const amount = Number(row.total)
    categoryTotals.set(label, (categoryTotals.get(label) || 0) + amount)

    const bucket = periods[periodIndex.get(periodStr)]
    bucket[label] = (bucket[label] || 0) + amount
  }

  const rankedLabels = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)

  const topLabels = rankedLabels.slice(0, MAX_CATEGORIES)
  const overflowLabels = rankedLabels.slice(MAX_CATEGORIES)
  const hasOther = overflowLabels.length > 0

  const categories = hasOther ? [...topLabels, 'Other'] : topLabels

  const series = periods.map(({ period, ...amounts }) => {
    const out = { period }
    for (const label of topLabels) out[label] = amounts[label] || 0
    if (hasOther) {
      out.Other = overflowLabels.reduce((sum, label) => sum + (amounts[label] || 0), 0)
    }
    return out
  })

  return { ...meta, categories, series }
}

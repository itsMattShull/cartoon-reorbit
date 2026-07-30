// GET /api/economy/net-points
// Daily net points issued (earned - spent) for the last 30 days, with the same
// 7-day moving average the admin analytics chart uses. Same query shape as
// server/api/admin/net-points-issues.get.js (daily branch), but fixed to a
// 30-day window and readable by any logged-in player — the series is a pure
// economy-wide aggregate with no per-user data in it.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_KEY = 'economy:net-points:30d:v1'
const CACHE_TTL = 300 // 5 min — PointsLog changes constantly but this is a 30-day trend

async function computeSeries() {
  // The moving average needs 6 days of lead-in before the window starts,
  // otherwise the first points of the chart average over a short window.
  const rows = await prisma.$queryRaw`
    WITH
      bounds AS (
        SELECT (now() - INTERVAL '36 days')::date AS start_day,
               now()::date                        AS end_day
      ),
      day_series AS (
        SELECT generate_series((SELECT start_day FROM bounds),
                               (SELECT end_day   FROM bounds),
                               '1 day')::date AS period
      ),
      agg AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM(CASE WHEN "direction" = 'increase' THEN "points" ELSE 0 END)::bigint AS earned,
          SUM(CASE WHEN "direction" = 'decrease' THEN "points" ELSE 0 END)::bigint AS spent
        FROM "PointsLog"
        WHERE "createdAt" >= (SELECT start_day FROM bounds)
          AND "createdAt" <  (SELECT end_day FROM bounds) + INTERVAL '1 day'
        GROUP BY 1
      ),
      joined AS (
        SELECT ds.period,
               COALESCE(a.earned, 0) AS earned,
               COALESCE(a.spent, 0)  AS spent
        FROM day_series ds
        LEFT JOIN agg a ON a.period = ds.period
      )
    SELECT
      period,
      earned,
      spent,
      (earned - spent) AS net,
      ROUND(AVG(earned - spent) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)::numeric, 2) AS net_ma7
    FROM joined
    ORDER BY period;
  `

  // Drop the moving-average lead-in so the chart shows exactly 30 days.
  return rows.slice(-30).map(r => ({
    period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period),
    earned: Number(r.earned),
    spent: Number(r.spent),
    net: Number(r.net),
    movingAvg7Day: Number(r.net_ma7)
  }))
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  const series = await computeSeries()
  try {
    await redis.set(CACHE_KEY, JSON.stringify(series), 'EX', CACHE_TTL)
  } catch {}

  return series
})

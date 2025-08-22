// server/api/admin/net-points-issues.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Parse params → timeframe → exact window sizes; grouping (default daily)
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = rawGroupBy === 'weekly' ? 'weekly' : 'daily'

  const TF_DAYS  = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  const TF_WEEKS = { '1m':  4, '3m': 13, '6m':  26, '1y':  52 }

  const days  = TF_DAYS[timeframe]  ?? 90
  const weeks = TF_WEEKS[timeframe] ?? 13

  if (groupBy === 'weekly') {
    // Exact N weeks ending this week (no off-by-one from week truncation)
    const weekly = await prisma.$queryRawUnsafe(`
      WITH
        bounds AS (
          SELECT date_trunc('week', now()::date) AS end_wk,
                 date_trunc('week', now()::date) - INTERVAL '${weeks - 1} week' AS start_wk
        ),
        week_series AS (
          SELECT generate_series((SELECT start_wk FROM bounds),
                                 (SELECT end_wk   FROM bounds),
                                 '1 week') AS period
        ),
        weekly_agg AS (
          SELECT
            date_trunc('week', "createdAt")::date AS period,
            SUM(
              CASE WHEN "direction" = 'increase' THEN "points"
                   ELSE -"points"
              END
            )::int AS net_points
          FROM "PointsLog"
          WHERE "createdAt" >= (SELECT start_wk FROM bounds)
            AND "createdAt" <  (SELECT end_wk   FROM bounds) + INTERVAL '1 week'
          GROUP BY 1
        )
      SELECT
        ws.period,
        COALESCE(wa.net_points, 0) AS net_points,
        ROUND((
          AVG(COALESCE(wa.net_points, 0))
            OVER (ORDER BY ws.period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        )::numeric, 2) AS moving_avg_7period
      FROM week_series ws
      LEFT JOIN weekly_agg wa ON wa.period = ws.period
      ORDER BY ws.period;
    `)

    const series = weekly.map(r => ({
      period:        r.period,
      netPoints:     Number(r.net_points),
      // keep frontend key; represents 7-week MA here
      movingAvg7Day: Number(r.moving_avg_7period)
    }))

    return {
      timeframe,
      days,         // also expose days for consistency if the UI needs it
      weeks,        // exact weeks for the timeframe
      series        // length === weeks
    }
  }

  // ---- Daily series (exact N days) + 7-day moving average ----
  const daily = await prisma.$queryRawUnsafe(`
    WITH
      bounds AS (
        SELECT (now() - INTERVAL '${days} days')::date AS start_day,
               now()::date                            AS end_day
      ),
      day_series AS (
        SELECT generate_series((SELECT start_day FROM bounds),
                               (SELECT end_day   FROM bounds),
                               '1 day') AS period
      ),
      daily_agg AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM(
            CASE WHEN "direction" = 'increase' THEN "points"
                 ELSE -"points"
            END
          )::int AS net_points
        FROM "PointsLog"
        WHERE "createdAt" >= (SELECT start_day FROM bounds)
          AND "createdAt" <  (SELECT end_day   FROM bounds) + INTERVAL '1 day'
        GROUP BY 1
      )
    SELECT
      ds.period,
      COALESCE(da.net_points, 0) AS net_points,
      ROUND((
        AVG(COALESCE(da.net_points, 0))
          OVER (ORDER BY ds.period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
      )::numeric, 2) AS moving_avg_7day
    FROM day_series ds
    LEFT JOIN daily_agg da ON da.period = ds.period
    ORDER BY ds.period;
  `)

  return {
    timeframe,
    days,     // exact days for the timeframe
    daily: daily.map(r => ({
      period:        r.period,
      netPoints:     Number(r.net_points),
      movingAvg7Day: Number(r.moving_avg_7day)
    }))
  }
})

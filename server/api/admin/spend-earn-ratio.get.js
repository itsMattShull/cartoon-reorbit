// server/api/admin/spend-earn-ratio.get.js
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

  // 2) Params: timeframe → exact window sizes; groupBy (default daily)
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = rawGroupBy === 'weekly' ? 'weekly' : 'daily'

  const TF_DAYS  = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  const TF_WEEKS = { '1m':  4, '3m': 13, '6m':  26, '1y':  52 }

  const days  = TF_DAYS[timeframe]  ?? 90
  const weeks = TF_WEEKS[timeframe] ?? 13

  if (groupBy === 'weekly') {
    // Exact N weeks ending this week
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
        raw_agg AS (
          SELECT
            date_trunc('week', "createdAt")::date AS period,
            COALESCE(
              SUM(CASE WHEN "direction"='decrease' THEN points ELSE 0 END)::float
              / NULLIF(SUM(CASE WHEN "direction"='increase' THEN points ELSE 0 END), 0),
              0
            ) AS ratio
          FROM "PointsLog"
          WHERE "createdAt" >= (SELECT start_wk FROM bounds)
            AND "createdAt" <  (SELECT end_wk   FROM bounds) + INTERVAL '1 week'
          GROUP BY 1
        )
      SELECT
        ws.period,
        ROUND(COALESCE(ra.ratio, 0)::numeric, 3) AS spend_earn_ratio,
        ROUND((
          AVG(COALESCE(ra.ratio, 0))
            OVER (ORDER BY ws.period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        )::numeric, 3) AS moving_avg_7period
      FROM week_series ws
      LEFT JOIN raw_agg ra ON ra.period = ws.period
      ORDER BY ws.period;
    `)

    const series = weekly.map(r => ({
      period:         r.period,
      spendEarnRatio: Number(r.spend_earn_ratio),
      // keep key name for UI: 7-week MA here
      movingAvg7Day:  Number(r.moving_avg_7period)
    }))

    return {
      timeframe,
      days,   // expose both for UI convenience
      weeks,  // exact weeks for timeframe
      series  // length === weeks
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
      raw_agg AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          COALESCE(
            SUM(CASE WHEN "direction"='decrease' THEN points ELSE 0 END)::float
            / NULLIF(SUM(CASE WHEN "direction"='increase' THEN points ELSE 0 END), 0),
            0
          ) AS ratio
        FROM "PointsLog"
        WHERE "createdAt" >= (SELECT start_day FROM bounds)
          AND "createdAt" <  (SELECT end_day   FROM bounds) + INTERVAL '1 day'
        GROUP BY 1
      )
    SELECT
      ds.period,
      ROUND(COALESCE(ra.ratio, 0)::numeric, 3) AS spend_earn_ratio,
      ROUND((
        AVG(COALESCE(ra.ratio, 0))
          OVER (ORDER BY ds.period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
      )::numeric, 3) AS moving_avg_7day
    FROM day_series ds
    LEFT JOIN raw_agg ra ON ra.period = ds.period
    ORDER BY ds.period;
  `)

  return {
    timeframe,
    days,   // exact days for timeframe
    daily: daily.map(r => ({
      period:         r.period,
      spendEarnRatio: Number(r.spend_earn_ratio),
      movingAvg7Day:  Number(r.moving_avg_7day)
    }))
  }
})

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

  // 2) Params: timeframe → days, groupBy (daily | weekly; default daily)
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = rawGroupBy === 'weekly' ? 'weekly' : 'daily'

  let days
  switch (timeframe) {
    case '1m': days = 30;  break
    case '3m': days = 90;  break
    case '6m': days = 180; break
    case '1y': days = 365; break
    default:   days = 90
  }

  if (groupBy === 'weekly') {
    // ---- Weekly series (with gaps) + 7-week moving average ----
    const weekly = await prisma.$queryRawUnsafe(`
      WITH
        week_series AS (
          SELECT generate_series(
            date_trunc('week', (now() - INTERVAL '${days} days')::date),
            date_trunc('week', now()::date),
            '1 week'
          ) AS period
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
          WHERE "createdAt" >= now() - INTERVAL '${days} days'
          GROUP BY 1
        )
      SELECT
        ws.period,
        -- ratio as numeric(…): OK to round with scale arg
        ROUND(COALESCE(ra.ratio, 0)::numeric, 3) AS spend_earn_ratio,
        -- CAST windowed avg to numeric BEFORE rounding (fixes round(double, int) error)
        ROUND(
          (
            AVG(COALESCE(ra.ratio, 0))
              OVER (
                ORDER BY ws.period
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
              )
          )::numeric,
          3
        ) AS moving_avg_7period
      FROM week_series ws
      LEFT JOIN raw_agg ra ON ra.period = ws.period
      ORDER BY ws.period;
    `)

    const series = weekly.map(r => ({
      period: r.period,
      spendEarnRatio: Number(r.spend_earn_ratio),
      // keep key name for UI compatibility (represents 7-week MA here)
      movingAvg7Day: Number(r.moving_avg_7period)
    }))

    return {
      timeframe,
      weeks: series.length,
      series
    }
  }

  // ---- Daily series (with gaps) + 7-day moving average ----
  const daily = await prisma.$queryRawUnsafe(`
    WITH
      day_series AS (
        SELECT generate_series(
          (now() - INTERVAL '${days} days')::date,
          now()::date,
          '1 day'
        ) AS period
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
        WHERE "createdAt" >= now() - INTERVAL '${days} days'
        GROUP BY 1
      )
    SELECT
      ds.period,
      ROUND(COALESCE(ra.ratio, 0)::numeric, 3) AS spend_earn_ratio,
      -- CAST windowed avg to numeric BEFORE rounding
      ROUND(
        (
          AVG(COALESCE(ra.ratio, 0))
            OVER (
              ORDER BY ds.period
              ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            )
        )::numeric,
        3
      ) AS moving_avg_7day
    FROM day_series ds
    LEFT JOIN raw_agg ra ON ra.period = ds.period
    ORDER BY ds.period;
  `)

  return {
    timeframe,
    days,
    daily: daily.map(r => ({
      period:         r.period,
      spendEarnRatio: Number(r.spend_earn_ratio),
      movingAvg7Day:  Number(r.moving_avg_7day)
    }))
  }
})

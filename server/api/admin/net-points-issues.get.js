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

  // 2) Parse params → timeframe → days; grouping (default daily)
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
        weekly_agg AS (
          SELECT
            date_trunc('week', "createdAt")::date AS period,
            SUM(
              CASE WHEN "direction" = 'increase' THEN "points"
                   ELSE -"points"
              END
            )::int AS net_points
          FROM "PointsLog"
          WHERE "createdAt" >= now() - INTERVAL '${days} days'
          GROUP BY 1
        )
      SELECT
        ws.period,
        COALESCE(wa.net_points, 0) AS net_points,
        ROUND(
          (
            AVG(COALESCE(wa.net_points, 0))
              OVER (
                ORDER BY ws.period
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
              )
          )::numeric,
          2
        ) AS moving_avg_7period
      FROM week_series ws
      LEFT JOIN weekly_agg wa ON wa.period = ws.period
      ORDER BY ws.period;
    `)

    const series = weekly.map(r => ({
      period:        r.period,
      netPoints:     Number(r.net_points),
      // keep the same key the frontend expects; it's a 7-period MA when weekly
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
      daily_agg AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM(
            CASE WHEN "direction" = 'increase' THEN "points"
                 ELSE -"points"
            END
          )::int AS net_points
        FROM "PointsLog"
        WHERE "createdAt" >= now() - INTERVAL '${days} days'
        GROUP BY 1
      )
    SELECT
      ds.period,
      COALESCE(da.net_points, 0) AS net_points,
      ROUND(
        (
          AVG(COALESCE(da.net_points, 0))
            OVER (
              ORDER BY ds.period
              ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            )
        )::numeric,
        2
      ) AS moving_avg_7day
    FROM day_series ds
    LEFT JOIN daily_agg da
      ON da.period = ds.period
    ORDER BY ds.period;
  `)

  return {
    timeframe,        // e.g. '1m','3m','6m','1y'
    days,             // numeric window length
    daily: daily.map(r => ({
      period:        r.period,
      netPoints:     Number(r.net_points),
      movingAvg7Day: Number(r.moving_avg_7day)
    }))
  }
})

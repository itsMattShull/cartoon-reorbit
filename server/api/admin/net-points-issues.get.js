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

  // 2) Parse & normalize timeframe → days
  const { timeframe = '3m' } = getQuery(event)
  let days
  switch (timeframe) {
    case '1m': days = 30;  break
    case '3m': days = 90;  break
    case '6m': days = 180; break
    case '1y': days = 365; break
    default:   days = 90
  }

  // 3a) Daily series with gaps filled
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
        GROUP BY period
      )
    SELECT
      ds.period,
      COALESCE(da.net_points, 0) AS net_points,
      ROUND(
        AVG(COALESCE(da.net_points, 0))
          OVER (
            ORDER BY ds.period
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
          )
        , 2
      ) AS moving_avg_7day
    FROM day_series ds
    LEFT JOIN daily_agg da
      ON da.period = ds.period
    ORDER BY ds.period;
  `)

  // 3b) Weekly buckets
  const weekly = await prisma.$queryRawUnsafe(`
    SELECT
      date_trunc('week', "createdAt")::date AS period,
      SUM(
        CASE WHEN "direction" = 'increase' THEN "points"
             ELSE -"points"
        END
      )::int AS net_points
    FROM "PointsLog"
    WHERE "createdAt" >= now() - INTERVAL '${days} days'
    GROUP BY period
    ORDER BY period;
  `)

  // 3c) Monthly buckets
  const monthly = await prisma.$queryRawUnsafe(`
    SELECT
      date_trunc('month', "createdAt")::date AS period,
      SUM(
        CASE WHEN "direction" = 'increase' THEN "points"
             ELSE -"points"
        END
      )::int AS net_points
    FROM "PointsLog"
    WHERE "createdAt" >= now() - INTERVAL '${days} days'
    GROUP BY period
    ORDER BY period;
  `)

  // 4) Return everything
  return {
    timeframe,        // e.g. '1m','3m','6m','1y'
    days,             // numeric window length
    daily: daily.map(r => ({
      period:        r.period,
      netPoints:     r.net_points,
      movingAvg7Day: r.moving_avg_7day
    })),
    weekly: weekly.map(r => ({
      period:    r.period,
      netPoints: r.net_points
    })),
    monthly: monthly.map(r => ({
      period:    r.period,
      netPoints: r.net_points
    }))
  }
})

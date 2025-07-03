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

  // 2) Timeframe → days
  const { timeframe = '3m' } = getQuery(event)
  let days
  switch (timeframe) {
    case '1m': days = 30;  break
    case '3m': days = 90;  break
    case '6m': days = 180; break
    case '1y': days = 365; break
    default:   days = 90
  }

  // 3a) Daily series with gaps filled, plus 7-day MA
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
            / NULLIF(
                SUM(CASE WHEN "direction"='increase' THEN points ELSE 0 END),
                0
              ),
            0
          ) AS ratio
        FROM "PointsLog"
        WHERE "createdAt" >= now() - INTERVAL '${days} days'
        GROUP BY 1
      )
    SELECT
      ds.period,
      COALESCE(ra.ratio, 0) AS spend_earn_ratio,
      ROUND(
        CAST(
          AVG(COALESCE(ra.ratio, 0))
            OVER (
              ORDER BY ds.period
              ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            )
          AS numeric
        ),
        3
      ) AS moving_avg_7day
    FROM day_series ds
    LEFT JOIN raw_agg ra ON ra.period = ds.period
    ORDER BY ds.period;
  `)

  // 3b) Weekly buckets
  const weekly = await prisma.$queryRawUnsafe(`
    SELECT
      date_trunc('week', "createdAt")::date AS period,
      COALESCE(
        SUM(CASE WHEN "direction"='decrease' THEN points ELSE 0 END)::float
        / NULLIF(
            SUM(CASE WHEN "direction"='increase' THEN points ELSE 0 END),
            0
          ),
        0
      ) AS spend_earn_ratio
    FROM "PointsLog"
    WHERE "createdAt" >= now() - INTERVAL '${days} days'
    GROUP BY 1
    ORDER BY 1;
  `)

  // 3c) Monthly buckets
  const monthly = await prisma.$queryRawUnsafe(`
    SELECT
      date_trunc('month', "createdAt")::date AS period,
      COALESCE(
        SUM(CASE WHEN "direction"='decrease' THEN points ELSE 0 END)::float
        / NULLIF(
            SUM(CASE WHEN "direction"='increase' THEN points ELSE 0 END),
            0
          ),
        0
      ) AS spend_earn_ratio
    FROM "PointsLog"
    WHERE "createdAt" >= now() - INTERVAL '${days} days'
    GROUP BY 1
    ORDER BY 1;
  `)

  // 4) Shape JSON
  return {
    timeframe,  // '1m','3m','6m','1y'
    days,       // numeric window length
    daily: daily.map(r => ({
      period:          r.period,
      spendEarnRatio:  Number(r.spend_earn_ratio.toFixed(3)),
      movingAvg7Day:   Number(r.moving_avg_7day.toFixed(3))
    })),
    weekly: weekly.map(r => ({
      period:         r.period,
      spendEarnRatio: Number(r.spend_earn_ratio.toFixed(3))
    })),
    monthly: monthly.map(r => ({
      period:         r.period,
      spendEarnRatio: Number(r.spend_earn_ratio.toFixed(3))
    }))
  }
})

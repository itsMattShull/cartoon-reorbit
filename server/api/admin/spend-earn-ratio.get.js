// server/api/admin/spend-earn-ratio.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin auth
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

  // 2) timeframe → days
  const { timeframe = '3m' } = getQuery(event)
  let days
  switch (timeframe) {
    case '1m': days = 30;  break
    case '3m': days = 90;  break
    case '6m': days = 180; break
    case '1y': days = 365; break
    default:   days = 90
  }

  // 3) Daily series + spend/earn ratio
  const daily = await prisma.$queryRawUnsafe(`
    WITH
      series AS (
        SELECT generate_series(
          (now() - INTERVAL '${days} days')::date,
           now()::date,
          '1 day'
        ) AS period
      ),
      dec AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM("points")::float AS spent
        FROM "PointsLog"
        WHERE "direction" = 'decrease'
          AND "createdAt" >= now() - INTERVAL '${days} days'
        GROUP BY 1
      ),
      inc AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM("points")::float AS earned
        FROM "PointsLog"
        WHERE "direction" = 'increase'
          AND "createdAt" >= now() - INTERVAL '${days} days'
        GROUP BY 1
      )
    SELECT
      s.period,
      d.spent / NULLIF(i.earned, 0) AS spend_earn_ratio
    FROM series s
    LEFT JOIN dec d ON d.period = s.period
    LEFT JOIN inc i ON i.period = s.period
    ORDER BY s.period;
  `)

  // 4) Map, guarding null → 0
  return {
    timeframe,
    days,
    daily: daily.map(r => {
      // if ratio is null (no earned pts), treat as 0
      const raw = r.spend_earn_ratio
      const ratio = raw !== null
        ? Number(raw.toFixed(2))
        : 0
      return {
        period:           r.period,
        spendEarnRatio:   ratio
      }
    })
  }
})

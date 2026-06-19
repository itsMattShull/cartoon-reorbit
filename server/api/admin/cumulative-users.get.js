// server/api/admin/cumulative-users.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 1800 // 30 minutes

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

  // 2) Parse & normalize timeframe (default 3m) + grouping (default weekly)
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly' || rawGroupBy === 'monthly')
    ? rawGroupBy
    : 'weekly'

  // 3) Cache check
  const cacheKey = `admin:cumulative-users:${timeframe}:${groupBy}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  async function cacheAndReturn(result) {
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
    return result
  }

  if (groupBy === 'daily') {
    // ---- Daily cumulative users ----
    const raw = await prisma.$queryRaw`
      WITH
        days AS (
          SELECT generate_series(
            date_trunc('day', ${startDate}),
            date_trunc('day', now()),
            '1 day'
          ) AS day
        ),
        base AS (
          SELECT COUNT(*)::int AS before_count
          FROM "User"
          WHERE "createdAt" < ${startDate}
        ),
        stats AS (
          SELECT
            date_trunc('day', "createdAt") AS day,
            COUNT(*)::int AS cnt
          FROM "User"
          WHERE "createdAt" >= ${startDate}
          GROUP BY day
        )
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS day,
        (b.before_count + COALESCE(
          SUM(s.cnt) OVER (ORDER BY d.day),
          0
        ))::int AS cumulative
      FROM days d
      LEFT JOIN stats s
        ON s.day = d.day
      CROSS JOIN base b
      ORDER BY d.day
    `

    return cacheAndReturn(raw.map(r => ({
      day: r.day,
      cumulative: typeof r.cumulative === 'bigint' ? Number(r.cumulative) : r.cumulative
    })))
  }

  if (groupBy === 'monthly') {
    // ---- Monthly cumulative users ----
    const raw = await prisma.$queryRaw`
      WITH
        months AS (
          SELECT generate_series(
            date_trunc('month', ${startDate}),
            date_trunc('month', now()),
            '1 month'
          ) AS month
        ),
        base AS (
          SELECT COUNT(*)::int AS before_count
          FROM "User"
          WHERE "createdAt" < ${startDate}
        ),
        stats AS (
          SELECT
            date_trunc('month', "createdAt") AS month,
            COUNT(*)::int AS cnt
          FROM "User"
          WHERE "createdAt" >= ${startDate}
          GROUP BY month
        )
      SELECT
        to_char(m.month, 'YYYY-MM-DD') AS month,
        (b.before_count + COALESCE(
          SUM(s.cnt) OVER (ORDER BY m.month),
          0
        ))::int AS cumulative
      FROM months m
      LEFT JOIN stats s
        ON s.month = m.month
      CROSS JOIN base b
      ORDER BY m.month
    `

    return cacheAndReturn(raw.map(r => ({
      month: r.month,
      cumulative: typeof r.cumulative === 'bigint' ? Number(r.cumulative) : r.cumulative
    })))
  }

  // ---- Weekly cumulative users (original behavior) ----
  const raw = await prisma.$queryRaw`
    WITH
      weeks AS (
        SELECT generate_series(
          date_trunc('week', ${startDate}),
          date_trunc('week', now()),
          '1 week'
        ) AS week
      ),
      base AS (
        SELECT COUNT(*)::int AS before_count
        FROM "User"
        WHERE "createdAt" < ${startDate}
      ),
      stats AS (
        SELECT
          date_trunc('week', "createdAt") AS week,
          COUNT(*)::int AS cnt
        FROM "User"
        WHERE "createdAt" >= ${startDate}
        GROUP BY week
      )
    SELECT
      to_char(w.week, 'YYYY-MM-DD') AS week,
      (b.before_count + COALESCE(
        SUM(s.cnt) OVER (ORDER BY w.week),
        0
      ))::int AS cumulative
    FROM weeks w
    LEFT JOIN stats s
      ON s.week = w.week
    CROSS JOIN base b
    ORDER BY w.week
  `

  return cacheAndReturn(raw.map(r => ({
    week: r.week,
    cumulative: typeof r.cumulative === 'bigint' ? Number(r.cumulative) : r.cumulative
  })))
})

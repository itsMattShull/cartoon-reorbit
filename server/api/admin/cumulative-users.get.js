// server/api/admin/cumulative-users.get.js

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

  // 2) Parse & normalize timeframe (default 3m) + grouping (default weekly)
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly') ? rawGroupBy : 'weekly'

  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
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

    return raw.map(r => ({
      day: r.day,
      cumulative: typeof r.cumulative === 'bigint' ? Number(r.cumulative) : r.cumulative
    }))
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

  return raw.map(r => ({
    week: r.week,
    cumulative: typeof r.cumulative === 'bigint' ? Number(r.cumulative) : r.cumulative
  }))
})

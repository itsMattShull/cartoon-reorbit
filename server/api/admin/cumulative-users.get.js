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

  // 2) Parse & normalize timeframe (default 3m)
  const { timeframe = '3m' } = getQuery(event)
  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  // 3) Build the per-week series, plus an “offset” of all users before startDate,
  //    but only count in `stats` those who actually joined on/after startDate.
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
      -- offset + running sum of only the new users in each week
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

  // 4) Serialize BigInt → Number
  return raw.map(r => ({
    week:       r.week,
    cumulative: typeof r.cumulative === 'bigint'
                ? Number(r.cumulative)
                : r.cumulative
  }))
})

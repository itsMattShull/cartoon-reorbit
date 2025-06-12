// server/api/admin/cumulative-users.get.js


import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── 1. Admin check ────────────────────────────────────────────────
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

  // ── 2. Parse & normalize timeframe (default 3m) ──────────────────
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

  // ── 3. Build per-week series + cumulative sum ────────────────────
  const raw = await prisma.$queryRaw`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${startDate}),
        date_trunc('week', now()),
        '1 week'
      ) AS week
    ), stats AS (
      SELECT
        date_trunc('week', "createdAt") AS week,
        COUNT(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= ${startDate}
      GROUP BY week
    )
    SELECT
      to_char(w.week, 'YYYY-MM-DD')        AS week,
      SUM(COALESCE(s.count, 0)) 
        OVER (ORDER BY w.week)             AS cumulative
    FROM weeks w
    LEFT JOIN stats s
      ON s.week = w.week
    ORDER BY w.week
  `

  // ── 4. Serialize BigInt → Number for H3 ─────────────────────────
  const result = raw.map(row => ({
    week: row.week,
    cumulative: typeof row.cumulative === 'bigint'
      ? Number(row.cumulative)
      : row.cumulative
  }))

  return result
})

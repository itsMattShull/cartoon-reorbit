// server/api/admin/percentage-first-purchase.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── 1. Admin check via your /api/auth/me endpoint ─────────────────────────
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

  // ── 2. Parse & normalize timeframe (default 3m) + grouping (default weekly) ─
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly') ? rawGroupBy : 'weekly'

  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m':  startDate.setMonth(startDate.getMonth() - 1); break
    case '3m':  startDate.setMonth(startDate.getMonth() - 3); break
    case '6m':  startDate.setMonth(startDate.getMonth() - 6); break
    case '1y':  startDate.setFullYear(startDate.getFullYear() - 1); break
    default:    startDate.setMonth(startDate.getMonth() - 3)
  }

  if (groupBy === 'daily') {
    // ── 3a. Daily: % of users with ≥1 purchase within 1 day of signup ──────
    const result = await prisma.$queryRaw`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${startDate}),
          date_trunc('day', now()),
          '1 day'
        ) AS day
      ),
      purchases AS (
        SELECT
          uc."userId",
          MIN(uc."createdAt") AS first_purchase
        FROM "UserCtoon" uc
        WHERE uc."userPurchased" = TRUE
        GROUP BY uc."userId"
      ),
      stats AS (
        SELECT
          date_trunc('day', u."createdAt") AS day,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE p.first_purchase <= u."createdAt" + INTERVAL '1 day'
          )::int AS purchased
        FROM "User" u
        LEFT JOIN purchases p
          ON p."userId" = u.id
        WHERE u."createdAt" >= ${startDate}
        GROUP BY day
      )
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS day,
        ROUND(
          CASE
            WHEN COALESCE(s.total, 0) = 0 THEN 0
            ELSE (s.purchased::decimal * 100 / s.total)
          END
        , 0)::int AS percentage
      FROM days d
      LEFT JOIN stats s
        ON s.day = d.day
      ORDER BY d.day
    `
    return result
  }

  // ── 3b. Weekly (original behavior): % within 1 day of signup ─────────────
  const result = await prisma.$queryRaw`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${startDate}),
        date_trunc('week', now()),
        '1 week'
      ) AS week
    ),
    purchases AS (
      SELECT
        uc."userId",
        MIN(uc."createdAt") AS first_purchase
      FROM "UserCtoon" uc
      WHERE uc."userPurchased" = TRUE
      GROUP BY uc."userId"
    ),
    stats AS (
      SELECT
        date_trunc('week', u."createdAt") AS week,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE p.first_purchase <= u."createdAt" + INTERVAL '1 day'
        )::int AS purchased
      FROM "User" u
      LEFT JOIN purchases p
        ON p."userId" = u.id
      WHERE u."createdAt" >= ${startDate}
      GROUP BY week
    )
    SELECT
      to_char(w.week, 'YYYY-MM-DD') AS week,
      ROUND(
        CASE
          WHEN COALESCE(s.total, 0) = 0 THEN 0
          ELSE (s.purchased::decimal * 100 / s.total)
        END
      , 0)::int AS percentage
    FROM weeks w
    LEFT JOIN stats s
      ON s.week = w.week
    ORDER BY w.week
  `

  return result
})

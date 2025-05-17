// server/api/admin/percentage-first-purchase.get.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'

const prisma = new PrismaClient()

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

  // ── 2. Parse & normalize timeframe (default 3m) ──────────────────────────
  const { timeframe = '3m' } = getQuery(event)
  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m':  startDate.setMonth(startDate.getMonth() - 1); break
    case '3m':  startDate.setMonth(startDate.getMonth() - 3); break
    case '6m':  startDate.setMonth(startDate.getMonth() - 6); break
    case '1y':  startDate.setFullYear(startDate.getFullYear() - 1); break
    default:    startDate.setMonth(startDate.getMonth() - 3)
  }

  // ── 3. SQL: include every week in the range, even if no users (percentage = 0) ──
  const result = await prisma.$queryRaw`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${startDate}),
        date_trunc('week', now()),
        '1 week'
      ) AS week
    ),
    stats AS (
      SELECT
        date_trunc('week', u."createdAt") AS week,
        COUNT(*)::int AS total,
        COUNT(
          DISTINCT CASE
            WHEN uc."userPurchased" = TRUE
             AND uc."createdAt" <= u."createdAt" + INTERVAL '1 day'
            THEN u.id
          END
        )::int AS purchased
      FROM "User" u
      LEFT JOIN "UserCtoon" uc
        ON uc."userId" = u.id
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
      , 2) AS percentage
    FROM weeks w
    LEFT JOIN stats s
      ON s.week = w.week
    ORDER BY w.week
  `
  
  return result
})

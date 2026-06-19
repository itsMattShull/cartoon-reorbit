// server/api/admin/codes-redeemed.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 1800 // 30 minutes

export default defineEventHandler(async (event) => {
  // 1) Admin check via your /api/auth/me endpoint
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

  // 2) Parse & normalize timeframe (default 3m) + grouping (default daily)
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly' || rawGroupBy === 'monthly')
    ? rawGroupBy
    : 'daily'

  // 3) Cache check
  const cacheKey = `admin:codes-redeemed:${timeframe}:${groupBy}`
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

  // 4) Aggregate codes redeemed by selected period
  if (groupBy === 'weekly') {
    const rows = await prisma.$queryRaw`
      SELECT
        to_char(date_trunc('week', "claimedAt"), 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS count
      FROM "Claim"
      WHERE "claimedAt" >= ${startDate}
      GROUP BY period
      ORDER BY period
    `
    return cacheAndReturn(rows)
  }

  if (groupBy === 'monthly') {
    const rows = await prisma.$queryRaw`
      SELECT
        to_char(date_trunc('month', "claimedAt"), 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS count
      FROM "Claim"
      WHERE "claimedAt" >= ${startDate}
      GROUP BY period
      ORDER BY period
    `
    return cacheAndReturn(rows)
  }

  // daily (original behavior)
  const rows = await prisma.$queryRaw`
    SELECT
      to_char(date_trunc('day', "claimedAt"), 'YYYY-MM-DD') AS period,
      COUNT(*)::int AS count
    FROM "Claim"
    WHERE "claimedAt" >= ${startDate}
    GROUP BY period
    ORDER BY period
  `
  return cacheAndReturn(rows)
})

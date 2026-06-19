// server/api/admin/purchases.get.js
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

  // 2) Parse timeframe, method, and grouping
  const { timeframe = '3m', method = 'ctoon', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly' || rawGroupBy === 'monthly')
    ? rawGroupBy
    : 'daily'

  // 3) Cache check
  const cacheKey = `admin:purchases:${timeframe}:${method}:${groupBy}`
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

  // 4) Helper to run the appropriate aggregation
  async function fetchPurchases(kind /* 'ctoon' | 'pack' */) {
    const like = kind === 'pack' ? '%Bought Pack%' : '%Bought cToon%'
    if (groupBy === 'weekly') {
      return prisma.$queryRaw`
        SELECT
          to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS period,
          COUNT(*)::int AS count
        FROM "PointsLog"
        WHERE method LIKE ${like}
          AND "createdAt" >= ${startDate}
        GROUP BY period
        ORDER BY period
      `
    }
    if (groupBy === 'monthly') {
      return prisma.$queryRaw`
        SELECT
          to_char(date_trunc('month', "createdAt"), 'YYYY-MM-DD') AS period,
          COUNT(*)::int AS count
        FROM "PointsLog"
        WHERE method LIKE ${like}
          AND "createdAt" >= ${startDate}
        GROUP BY period
        ORDER BY period
      `
    }
    // daily (original behavior)
    return prisma.$queryRaw`
      SELECT
        to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS count
      FROM "PointsLog"
      WHERE method LIKE ${like}
        AND "createdAt" >= ${startDate}
      GROUP BY period
      ORDER BY period
    `
  }

  async function cacheAndReturn(result) {
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
    return result
  }

  // 5) Return per requested method
  if (method === 'ctoon') {
    return cacheAndReturn(await fetchPurchases('ctoon'))
  } else if (method === 'pack') {
    return cacheAndReturn(await fetchPurchases('pack'))
  } else {
    const [ctoonPurchases, packPurchases] = await Promise.all([
      fetchPurchases('ctoon'),
      fetchPurchases('pack')
    ])
    return cacheAndReturn({ ctoonPurchases, packPurchases })
  }
})

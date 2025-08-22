// server/api/admin/purchases.get.js
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

  // 2) Parse timeframe, method, and grouping
  const { timeframe = '3m', method = 'ctoon', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = rawGroupBy === 'weekly' ? 'weekly' : 'daily'

  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  // 3) Helper to run the appropriate aggregation
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

  // 4) Return per requested method
  if (method === 'ctoon') {
    const ctoonPurchases = await fetchPurchases('ctoon')
    return ctoonPurchases
  } else if (method === 'pack') {
    const packPurchases = await fetchPurchases('pack')
    return packPurchases
  } else {
    // fallback—if someone omits/changes method, return both
    const [ctoonPurchases, packPurchases] = await Promise.all([
      fetchPurchases('ctoon'),
      fetchPurchases('pack')
    ])
    return { ctoonPurchases, packPurchases }
  }
})

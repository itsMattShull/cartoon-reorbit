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

  // 2) Parse timeframe & method
  const { timeframe = '3m', method = 'ctoon' } = getQuery(event)
  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  // 3) Query cToon purchases
  const ctoonPurchases = await prisma.$queryRaw`
    SELECT
      to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS period,
      COUNT(*)::int AS count
    FROM "PointsLog"
    WHERE method LIKE '%Bought cToon%'
      AND "createdAt" >= ${startDate}
    GROUP BY period
    ORDER BY period
  `

  // 4) Query pack purchases
  const packPurchases = await prisma.$queryRaw`
    SELECT
      to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS period,
      COUNT(*)::int AS count
    FROM "PointsLog"
    WHERE method LIKE '%Bought Pack%'
      AND "createdAt" >= ${startDate}
    GROUP BY period
    ORDER BY period
  `

  // 5) Return the requested series
  if (method === 'ctoon') {
    return ctoonPurchases
  } else if (method === 'pack') {
    return packPurchases
  } else {
    // fallback—if someone omits method, return both
    return { ctoonPurchases, packPurchases }
  }
})

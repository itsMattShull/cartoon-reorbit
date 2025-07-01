// server/api/admin/trades-requested.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2) Parse & normalize timeframe (default 3m)
  const { timeframe = '3m' } = getQuery(event)
  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m':
      startDate.setMonth(startDate.getMonth() - 1)
      break
    case '3m':
      startDate.setMonth(startDate.getMonth() - 3)
      break
    case '6m':
      startDate.setMonth(startDate.getMonth() - 6)
      break
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
    default:
      startDate.setMonth(startDate.getMonth() - 3)
  }

  // 3) Aggregate trades requested by day
  const tradesRequested = await prisma.$queryRaw`
    SELECT
      to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS period,
      COUNT(*)::int AS count
    FROM "TradeOffer"
    WHERE "createdAt" >= ${startDate}
    GROUP BY period
    ORDER BY period
  `

  // 4) Return the series directly
  return tradesRequested
})

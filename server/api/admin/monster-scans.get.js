// server/api/admin/monster-scans.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
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

  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly' || rawGroupBy === 'monthly')
    ? rawGroupBy
    : 'daily'

  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  if (groupBy === 'weekly') {
    return prisma.$queryRaw`
      SELECT
        to_char(date_trunc('week', "scannedAt"), 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS scans,
        COUNT(DISTINCT "userId")::int AS "uniqueUsers"
      FROM "UserScan"
      WHERE "scannedAt" >= ${startDate}
      GROUP BY period
      ORDER BY period
    `
  }

  if (groupBy === 'monthly') {
    return prisma.$queryRaw`
      SELECT
        to_char(date_trunc('month', "scannedAt"), 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS scans,
        COUNT(DISTINCT "userId")::int AS "uniqueUsers"
      FROM "UserScan"
      WHERE "scannedAt" >= ${startDate}
      GROUP BY period
      ORDER BY period
    `
  }

  return prisma.$queryRaw`
    SELECT
      to_char(date_trunc('day', "scannedAt"), 'YYYY-MM-DD') AS period,
      COUNT(*)::int AS scans,
      COUNT(DISTINCT "userId")::int AS "uniqueUsers"
    FROM "UserScan"
    WHERE "scannedAt" >= ${startDate}
    GROUP BY period
    ORDER BY period
  `
})

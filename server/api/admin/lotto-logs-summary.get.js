// server/api/admin/lotto-logs-summary.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

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

  const { start, end, timeframe } = getQuery(event)

  let endDate =
    (typeof end === 'string' && parseEndYMD(end)) ||
    new Date()

  let startDate =
    (typeof start === 'string' && parseStartYMD(start)) ||
    null

  if (!startDate) {
    const s = new Date(endDate)
    switch (timeframe) {
      case '1m': s.setMonth(s.getMonth() - 1); break
      case '3m': s.setMonth(s.getMonth() - 3); break
      case '6m': s.setMonth(s.getMonth() - 6); break
      case '1y': s.setFullYear(s.getFullYear() - 1); break
      default: s.setDate(s.getDate() - 29)
    }
    const y = s.getUTCFullYear()
    const m = s.getUTCMonth()
    const d = s.getUTCDate()
    startDate = new Date(Date.UTC(y, m, d, 0, 0, 0, 0))
  }

  if (startDate > endDate) {
    const tmp = startDate
    startDate = endDate
    endDate = tmp
  }

  const groups = await prisma.lottoLog.groupBy({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    },
    by: ['outcome'],
    _count: { _all: true }
  })

  const data = groups.map(g => ({
    outcome: g.outcome,
    count: g._count._all
  }))
  const total = data.reduce((sum, r) => sum + r.count, 0)

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    total,
    data
  }
})

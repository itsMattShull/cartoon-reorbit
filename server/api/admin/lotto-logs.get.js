// server/api/admin/lotto-logs.get.js
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

  const q = getQuery(event)
  const { start, end, timeframe } = q

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

  const limit = Math.min(Math.max(parseInt(q.limit || '50', 10), 1), 200)
  const page = Math.max(parseInt(q.page || '1', 10), 1)
  const skip = (page - 1) * limit

  const where = {
    createdAt: { gte: startDate, lte: endDate }
  }

  const [total, items] = await Promise.all([
    prisma.lottoLog.count({ where }),
    prisma.lottoLog.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, discordTag: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })
  ])

  return {
    items,
    total,
    page,
    limit,
    start: startDate.toISOString(),
    end: endDate.toISOString()
  }
})

// server/api/admin/win-wheel-logs.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

/**
 * Parse a YYYY-MM-DD string to a Date (UTC start-of-day).
 */
function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}
/**
 * Parse a YYYY-MM-DD string to a Date (UTC end-of-day).
 */
function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

export default defineEventHandler(async (event) => {
  // 1) Admin check (same pattern as your reference)
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

  // 2) Query params
  // Supports either explicit date range (?start=YYYY-MM-DD&end=YYYY-MM-DD)
  // or a simple timeframe (?timeframe=1m|3m|6m|1y). If neither provided, defaults to last 30 days.
  const { start, end, timeframe } = getQuery(event)

  let endDate =
    (typeof end === 'string' && parseEndYMD(end)) ||
    new Date() // now (UTC-ish)

  let startDate =
    (typeof start === 'string' && parseStartYMD(start)) ||
    null

  if (!startDate) {
    // fallback to timeframe if provided; else last 30 days
    const s = new Date(endDate) // clone
    switch (timeframe) {
      case '1m': s.setMonth(s.getMonth() - 1); break
      case '3m': s.setMonth(s.getMonth() - 3); break
      case '6m': s.setMonth(s.getMonth() - 6); break
      case '1y': s.setFullYear(s.getFullYear() - 1); break
      default:   s.setDate(s.getDate() - 29) // last 30 days inclusive
    }
    // normalize to UTC start-of-day
    const y = s.getUTCFullYear()
    const m = s.getUTCMonth()
    const d = s.getUTCDate()
    startDate = new Date(Date.UTC(y, m, d, 0, 0, 0, 0))
  }

  // Ensure start <= end; if swapped, correct them
  if (startDate > endDate) {
    const tmp = startDate
    startDate = endDate
    endDate = tmp
  }

  // 3) Group counts by result within the window
  // Known results (from your schema/comments):
  // 'nothing' | 'points' | 'ctoonLeast' | 'ctoonExclusive' (plus any future values)
  const groups = await prisma.wheelSpinLog.groupBy({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    },
    by: ['result'],
    _count: { _all: true }
  })

  // 4) Shape response for the Vue page
  const data = groups.map(g => ({
    result: g.result,
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

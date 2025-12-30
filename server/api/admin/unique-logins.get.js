// server/api/admin/activity-unique.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { addDays, addWeeks, addMonths, subMonths, subYears, format, startOfWeek, startOfMonth } from 'date-fns'
import { prisma } from '@/server/prisma'

function getStartDate(timeframe) {
  const now = new Date()
  switch (timeframe) {
    case '1m': return subMonths(now, 1)
    case '3m': return subMonths(now, 3)
    case '6m': return subMonths(now, 6)
    case '1y': return subYears(now, 1)
    default:   return subMonths(now, 3)
  }
}

const WEEK_STARTS_ON = 1 // Monday

export default defineEventHandler(async (event) => {
  // Auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // Params
  const q = getQuery(event)
  const timeframe = q.timeframe || '3m'
  const groupBy = (q.groupBy === 'daily' || q.groupBy === 'weekly' || q.groupBy === 'monthly')
    ? q.groupBy
    : 'daily'

  const startDate = getStartDate(timeframe)
  const today = new Date()
  const endDate = new Date(format(today, 'yyyy-MM-dd')) // strip time
  const endExclusive = addDays(endDate, 1) // [startDate, endExclusive)

  // Fetch ONLY points logs in window
  const pointsLogs = await prisma.pointsLog.findMany({
    where: { createdAt: { gte: startDate, lt: endExclusive } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  })

  // Per-period unique users with at least one pointsLog
  if (groupBy === 'weekly') {
    const weekMap = new Map() // weekStart -> Set<userId>
    for (const r of pointsLogs) {
      if (!r.userId) continue
      const wkStart = startOfWeek(r.createdAt, { weekStartsOn: WEEK_STARTS_ON })
      const key = format(wkStart, 'yyyy-MM-dd')
      if (!weekMap.has(key)) weekMap.set(key, new Set())
      weekMap.get(key).add(r.userId)
    }

    const result = []
    const startWeek = startOfWeek(new Date(format(startDate, 'yyyy-MM-dd')), { weekStartsOn: WEEK_STARTS_ON })
    const endWeek = startOfWeek(endDate, { weekStartsOn: WEEK_STARTS_ON })
    let w = startWeek
    while (w <= endWeek) {
      const key = format(w, 'yyyy-MM-dd')
      result.push({ period: key, count: weekMap.get(key)?.size ?? 0 })
      w = addWeeks(w, 1)
    }
    return result
  } else if (groupBy === 'monthly') {
    const monthMap = new Map() // monthStart -> Set<userId>
    for (const r of pointsLogs) {
      if (!r.userId) continue
      const moStart = startOfMonth(r.createdAt)
      const key = format(moStart, 'yyyy-MM-dd')
      if (!monthMap.has(key)) monthMap.set(key, new Set())
      monthMap.get(key).add(r.userId)
    }

    const result = []
    const startMonth = startOfMonth(new Date(format(startDate, 'yyyy-MM-dd')))
    const endMonth = startOfMonth(endDate)
    let m = startMonth
    while (m <= endMonth) {
      const key = format(m, 'yyyy-MM-dd')
      result.push({ period: key, count: monthMap.get(key)?.size ?? 0 })
      m = addMonths(m, 1)
    }
    return result
  } else {
    const dayMap = new Map() // yyyy-MM-dd -> Set<userId>
    for (const r of pointsLogs) {
      if (!r.userId) continue
      const day = format(r.createdAt, 'yyyy-MM-dd')
      if (!dayMap.has(day)) dayMap.set(day, new Set())
      dayMap.get(day).add(r.userId)
    }

    const result = []
    let d = new Date(format(startDate, 'yyyy-MM-dd'))
    while (d <= endDate) {
      const key = format(d, 'yyyy-MM-dd')
      result.push({ day: key, count: dayMap.get(key)?.size ?? 0 })
      d = addDays(d, 1)
    }
    return result
  }
})

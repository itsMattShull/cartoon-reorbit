import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { addDays, addWeeks, subMonths, subYears, format, startOfWeek } from 'date-fns'

import { prisma } from '@/server/prisma'

function getStartDate(timeframe) {
  const now = new Date()
  switch (timeframe) {
    case '1m':
      return subMonths(now, 1)
    case '3m':
      return subMonths(now, 3)
    case '6m':
      return subMonths(now, 6)
    case '1y':
      return subYears(now, 1)
    default:
      return subMonths(now, 3)
  }
}

// Adjust this if you want weeks to start on Sunday (0) instead of Monday (1)
const WEEK_STARTS_ON = 1 // Monday

export default defineEventHandler(async (event) => {
  // Admin check
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

  const query = getQuery(event)
  const timeframe = query.timeframe || '3m'
  // New: grouping (daily | weekly). Default to daily for backward compatibility with existing clients.
  const groupBy = (query.groupBy === 'weekly') ? 'weekly' : 'daily'

  const startDate = getStartDate(timeframe)
  const today = new Date()
  const endDate = new Date(format(today, 'yyyy-MM-dd')) // strip time

  // Get all login logs since startDate
  const logs = await prisma.loginLog.findMany({
    where: {
      createdAt: {
        gte: startDate
      }
    },
    select: {
      userId: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })

  if (groupBy === 'weekly') {
    // ---- Weekly unique users (per week) ----
    // Map weekStart(yyyy-MM-dd) -> Set<userId>
    const weekMap = new Map()
    for (const log of logs) {
      const wkStart = startOfWeek(log.createdAt, { weekStartsOn: WEEK_STARTS_ON })
      const key = format(wkStart, 'yyyy-MM-dd')
      if (!weekMap.has(key)) weekMap.set(key, new Set())
      weekMap.get(key).add(log.userId)
    }

    // Fill missing weeks
    const result = []
    const startWeek = startOfWeek(new Date(format(startDate, 'yyyy-MM-dd')), { weekStartsOn: WEEK_STARTS_ON })
    const endWeek   = startOfWeek(endDate, { weekStartsOn: WEEK_STARTS_ON })

    let w = startWeek
    while (w <= endWeek) {
      const key = format(w, 'yyyy-MM-dd')
      result.push({
        // Use "period" so the frontend can read d.period || d.day || d.week
        period: key,
        count: weekMap.has(key) ? weekMap.get(key).size : 0
      })
      w = addWeeks(w, 1)
    }

    return result
  } else {
    // ---- Daily unique users (existing behavior) ----
    // Group by day and filter for unique users per day
    const dayMap = new Map()
    for (const log of logs) {
      const day = format(log.createdAt, 'yyyy-MM-dd')
      if (!dayMap.has(day)) {
        dayMap.set(day, new Set())
      }
      dayMap.get(day).add(log.userId)
    }

    // Fill in missing days with count: 0
    const result = []
    let d = new Date(format(startDate, 'yyyy-MM-dd'))
    while (d <= endDate) {
      const dayStr = format(d, 'yyyy-MM-dd')
      result.push({
        day: dayStr,
        count: dayMap.has(dayStr) ? dayMap.get(dayStr).size : 0
      })
      d = addDays(d, 1)
    }

    return result
  }
})

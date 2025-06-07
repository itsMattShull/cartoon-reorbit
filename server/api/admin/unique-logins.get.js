import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { addDays, subMonths, subYears, format, isAfter } from 'date-fns'

const prisma = new PrismaClient()

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
})
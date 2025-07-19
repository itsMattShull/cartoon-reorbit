// server/api/game/winwheel/status.get.js
import { prisma } from '@/server/prisma'
import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // — Load Winwheel config to get spinCost and maxDailySpins —
  const config = await prisma.gameConfig.findUnique({
    where: { gameName: 'Winwheel' },
    select: { spinCost: true, maxDailySpins: true }
  })
  if (!config) {
    throw createError({ statusCode: 500, statusMessage: 'Winwheel config not found' })
  }
  const { spinCost, maxDailySpins } = config

  // Current time
  const now = new Date()

  // 1. Compute offset between UTC and Chicago local time
  const chicagoNowStr = now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const chicagoNow    = new Date(chicagoNowStr)
  const offsetMs      = now.getTime() - chicagoNow.getTime()

  // 2. Build today's 08:00 CST in local, then translate to UTC
  const year  = chicagoNow.getFullYear()
  const month = chicagoNow.getMonth()
  const date  = chicagoNow.getDate()
  const resetLocal = new Date(year, month, date, 8, 0, 0, 0) // 8:00 AM Chicago
  let   resetUtcMs = resetLocal.getTime() + offsetMs         // back to UTC ms

  // If it's before 8 AM Chicago, use yesterday's reset
  if (now.getTime() < resetUtcMs) {
    resetUtcMs -= 24 * 60 * 60 * 1000
  }
  const windowStart = new Date(resetUtcMs)

  // 3. Count spins since windowStart
  const spinsToday = await prisma.wheelSpinLog.count({
    where: {
      userId,
      createdAt: { gte: windowStart }
    }
  })

  // 4. Compute next reset (windowStart + 24h)
  const nextReset = new Date(resetUtcMs + 24 * 60 * 60 * 1000)

  return {
    spinsLeft:  Math.max(0, maxDailySpins - spinsToday),
    nextReset:  nextReset.toISOString(),
    spinCost, 
  }
})

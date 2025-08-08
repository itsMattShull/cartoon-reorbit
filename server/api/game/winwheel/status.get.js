// server/api/game/winwheel/status.get.js
import { prisma } from '@/server/prisma'
import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // — Load Winwheel config to get spinCost, maxDailySpins, and pointsWon —
  const config = await prisma.gameConfig.findUnique({
    where: { gameName: 'Winwheel' },
    select: {
      spinCost: true,
      maxDailySpins: true,
      pointsWon: true
    }
  })
  if (!config) {
    throw createError({ statusCode: 500, statusMessage: 'Winwheel config not found' })
  }
  const { spinCost, maxDailySpins, pointsWon } = config

  const now = new Date()
  // compute Chicago‐local 8 AM in UTC
  const chicagoNowStr = now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const chicagoNow    = new Date(chicagoNowStr)
  const offsetMs      = now.getTime() - chicagoNow.getTime()

  const year  = chicagoNow.getFullYear()
  const month = chicagoNow.getMonth()
  const date  = chicagoNow.getDate()
  let resetUtcMs = new Date(year, month, date, 8, 0, 0).getTime() + offsetMs
  if (now.getTime() < resetUtcMs) {
    resetUtcMs -= 24 * 60 * 60 * 1000
  }
  const windowStart = new Date(resetUtcMs)

  const spinsToday = await prisma.wheelSpinLog.count({
    where: {
      userId,
      createdAt: { gte: windowStart }
    }
  })

  const nextReset = new Date(resetUtcMs + 24 * 60 * 60 * 1000)

  return {
    spinsLeft:     Math.max(0, maxDailySpins - spinsToday),
    nextReset:     nextReset.toISOString(),
    spinCost,
    maxDailySpins,
    pointsWon
  }
})

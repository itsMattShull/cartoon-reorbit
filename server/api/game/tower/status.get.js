import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'

function getDailyBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let b = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < b) b = b.minus({ days: 1 })
  return b.toUTC().toJSDate()
}

function getWeekBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  const dow = chicagoNow.weekday % 7 // luxon: Mon=1…Sun=7; we want Mon=0
  const monday = chicagoNow.minus({ days: dow === 0 ? 6 : dow - 1 }).set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
  return monday.toUTC().toJSDate()
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const config = await prisma.gameConfig.findUnique({ where: { gameName: 'TowerStack' } })
  const playsPerPeriod = config?.towerPlaysPerPeriod ?? 3

  const boundary = getDailyBoundary()
  const weekBoundary = getWeekBoundary()
  const nextReset = new Date(boundary.getTime() + 24 * 60 * 60 * 1000)

  const [playsToday, allTimeHigh, weekHigh] = await Promise.all([
    prisma.towerStackPlay.count({
      where: { userId, createdAt: { gte: boundary } }
    }),
    prisma.towerStackScore.aggregate({
      where: { userId },
      _max: { score: true }
    }),
    prisma.towerStackScore.aggregate({
      where: { createdAt: { gte: weekBoundary } },
      _max: { score: true }
    })
  ])

  return {
    config: {
      playsPerPeriod,
      pointsPerGame: config?.towerPointsPerGame ?? 50
    },
    playsLeft: Math.max(0, playsPerPeriod - playsToday),
    playsResetAt: nextReset.toISOString(),
    allTimeHigh: allTimeHigh._max.score ?? 0,
    weekHigh: weekHigh._max.score ?? 0
  }
})

import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { DEFAULT_EMOJIS } from '@/server/utils/reorbitMatchEngine'

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

  const config = await prisma.gameConfig.findUnique({ where: { gameName: 'ReOrbitMatch' } })

  const gridSize = config?.reorbitGridSize ?? 8
  const playsPerPeriod = config?.reorbitPlaysPerPeriod ?? 3
  const emojis = (config?.reorbitEmojis?.length ? config.reorbitEmojis : null) ?? DEFAULT_EMOJIS

  const boundary = getDailyBoundary()
  const weekBoundary = getWeekBoundary()

  const nextReset = new Date(boundary.getTime() + 24 * 60 * 60 * 1000)

  const [playsToday, allTimeHigh, weekHigh] = await Promise.all([
    prisma.reOrbitMatchPlay.count({
      where: { userId, createdAt: { gte: boundary } }
    }),
    prisma.reOrbitMatchScore.aggregate({
      where: { userId },
      _max: { score: true }
    }),
    prisma.reOrbitMatchScore.aggregate({
      where: { createdAt: { gte: weekBoundary } },
      _max: { score: true }
    })
  ])

  return {
    config: {
      gridSize,
      playsPerPeriod,
      pointsPerGame: config?.reorbitPointsPerGame ?? 50,
      timeSeconds: config?.reorbitTimeSeconds ?? null,
      emojis
    },
    playsLeft: Math.max(0, playsPerPeriod - playsToday),
    playsResetAt: nextReset.toISOString(),
    allTimeHigh: allTimeHigh._max.score ?? 0,
    weekHigh: weekHigh._max.score ?? 0
  }
})

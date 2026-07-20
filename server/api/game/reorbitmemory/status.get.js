import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { DEFAULT_PAIRS, gridDimsForPairs } from '@/server/utils/reorbitMemoryEngine'

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

  const config = await prisma.gameConfig.findUnique({ where: { gameName: 'ReOrbitMemory' } })

  const pairs = config?.reorbitMemoryPairs ?? DEFAULT_PAIRS
  const playsPerPeriod = config?.reorbitMemoryPlaysPerPeriod ?? 3
  const { cols, rows } = gridDimsForPairs(pairs)

  const boundary = getDailyBoundary()
  const weekBoundary = getWeekBoundary()
  const nextReset = new Date(boundary.getTime() + 24 * 60 * 60 * 1000)

  const [playsToday, allTimeBest, weekBest] = await Promise.all([
    prisma.reOrbitMemoryPlay.count({
      where: { userId, createdAt: { gte: boundary } }
    }),
    prisma.reOrbitMemoryScore.aggregate({
      where: { userId },
      _min: { moves: true }
    }),
    prisma.reOrbitMemoryScore.aggregate({
      where: { createdAt: { gte: weekBoundary } },
      _min: { moves: true }
    })
  ])

  return {
    config: {
      pairs,
      cols,
      rows,
      playsPerPeriod,
      pointsPerGame: config?.reorbitMemoryPointsPerGame ?? 50,
      timeSeconds: config?.reorbitMemoryTimeSeconds ?? null,
      flipBackDelayMs: config?.reorbitMemoryFlipBackDelayMs ?? 800,
      cardBackImagePath: config?.reorbitMemoryCardBackImagePath ?? null
    },
    playsLeft: Math.max(0, playsPerPeriod - playsToday),
    playsResetAt: nextReset.toISOString(),
    allTimeBest: allTimeBest._min.moves ?? null,
    weekBest: weekBest._min.moves ?? null
  }
})

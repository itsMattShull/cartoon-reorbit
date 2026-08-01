import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import {
  getGuessCtoonConfig,
  getDailyBoundary,
  getNextResetAt,
  getWeekBoundary
} from '@/server/utils/guessCtoonRuntime'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const config = await getGuessCtoonConfig()
  const boundary = getDailyBoundary()
  const weekBoundary = getWeekBoundary()

  const [playsToday, allTimeHigh, weekHigh] = await Promise.all([
    prisma.guessCtoonPlay.count({
      where: { userId, createdAt: { gte: boundary } }
    }),
    prisma.guessCtoonScore.aggregate({
      where: { userId },
      _max: { streak: true }
    }),
    // Global best this week, matching the other games' status endpoints (which likewise
    // filter on createdAt only, not on the viewer).
    prisma.guessCtoonScore.aggregate({
      where: { createdAt: { gte: weekBoundary }, suspicious: false },
      _max: { streak: true }
    })
  ])

  return {
    config: {
      playsPerPeriod: config.playsPerPeriod,
      pointsPerGame: config.pointsPerGame,
      secondsPerQuestion: config.secondsPerQuestion,
      choices: config.choices,
      maxQuestions: config.maxQuestions,
      minStreakForPoints: config.minStreakForPoints
    },
    playsLeft: Math.max(0, config.playsPerPeriod - playsToday),
    playsResetAt: getNextResetAt(boundary).toISOString(),
    allTimeHigh: allTimeHigh._max.streak ?? null,
    weekHigh: weekHigh._max.streak ?? null
  }
})

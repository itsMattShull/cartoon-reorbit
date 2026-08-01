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

  const [scoredPlaysUsed, allTimeHigh, weekHigh] = await Promise.all([
    prisma.guessCtoonPlay.count({
      where: { userId, counted: true, createdAt: { gte: boundary } }
    }),
    prisma.guessCtoonScore.aggregate({
      where: { userId, counted: true },
      _max: { streak: true }
    }),
    // Global best this week, matching the other games' status endpoints (which likewise
    // filter on createdAt only, not on the viewer).
    prisma.guessCtoonScore.aggregate({
      where: { createdAt: { gte: weekBoundary }, counted: true, suspicious: false },
      _max: { streak: true }
    })
  ])

  return {
    config: {
      scoredPlaysPerPeriod: config.scoredPlaysPerPeriod,
      pointsPerGame: config.pointsPerGame,
      secondsPerQuestion: config.secondsPerQuestion,
      choices: config.choices,
      maxQuestions: config.maxQuestions,
      minStreakForPoints: config.minStreakForPoints
    },
    // Plays themselves are unlimited; this is how many more will count today.
    scoredPlaysLeft: Math.max(0, config.scoredPlaysPerPeriod - scoredPlaysUsed),
    playsResetAt: getNextResetAt(boundary).toISOString(),
    allTimeHigh: allTimeHigh._max.streak ?? null,
    weekHigh: weekHigh._max.streak ?? null
  }
})

// server/api/survey/submit.post.js
// Saves the user's survey answers, awards 3000 points (once only),
// and enqueues background content analysis.

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma }               from '@/server/prisma'
import { contentAnalysisQueue } from '@/server/utils/queues'

const SURVEY_POINTS = 3000
const MIN_CHARS     = 250

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const whyJoin      = (body?.whyJoin      || '').trim()
  const howFound     = (body?.howFound     || '').trim()
  const favoriteShows = (body?.favoriteShows || '').trim()

  // Validate minimum length
  if (whyJoin.length < MIN_CHARS || howFound.length < MIN_CHARS || favoriteShows.length < MIN_CHARS) {
    throw createError({
      statusCode: 400,
      statusMessage: `Each answer must be at least ${MIN_CHARS} characters.`,
    })
  }

  // One submission per user
  const existing = await prisma.surveyAnswers.findUnique({ where: { userId } })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Survey already completed.' })
  }

  // Atomic: create answers + award points in one transaction
  await prisma.$transaction(async (tx) => {
    // 1. Create the survey record
    await tx.surveyAnswers.create({
      data: {
        userId,
        whyJoin,
        howFound,
        favoriteShows,
        whyJoinLen:       whyJoin.length,
        howFoundLen:      howFound.length,
        favoriteShowsLen: favoriteShows.length,
        pointsAwarded:    false,
      },
    })

    // 2. Ensure UserPoints row exists
    await tx.userPoints.upsert({
      where:  { userId },
      create: { userId, points: 0, lastDailyAward: null },
      update: {},
    })

    // 3. Increment points
    const updated = await tx.userPoints.update({
      where: { userId },
      data:  { points: { increment: SURVEY_POINTS } },
    })

    // 4. Write PointsLog entry (matches pattern in daily-points.js)
    await tx.pointsLog.create({
      data: {
        userId,
        points:    SURVEY_POINTS,
        total:     updated.points,
        method:    'Survey Completion',
        direction: 'increase',
      },
    })

    // 5. Mark points as awarded
    await tx.surveyAnswers.update({
      where: { userId },
      data:  { pointsAwarded: true },
    })
  })

  // Enqueue background content analysis (non-blocking — fire and forget)
  await contentAnalysisQueue.add('analyzeSurvey', { userId, whyJoin, howFound, favoriteShows })

  return { ok: true, pointsAwarded: SURVEY_POINTS }
})

import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import {
  getBlackjackConfig, findActiveSession, resetPracticeSession, buildTableView
} from '@/server/utils/blackjackRuntime'

/**
 * Practice mode only: hand the player their starting stack back.
 *
 * `resetPracticeSession` puts `mode: 'practice'` in the WHERE clause, so a gamble session is
 * not merely rejected here — it cannot be found at all. That distinction matters: this
 * endpoint creates chips from nothing, and pointing it at a gamble table would be an
 * unlimited points mint.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const rules = await getBlackjackConfig()
  const ok = await resetPracticeSession(userId, rules)
  if (!ok) throw createError({ statusCode: 409, statusMessage: 'No practice table to reset.' })

  const [session, pointsRow] = await Promise.all([
    findActiveSession(userId, 'practice'),
    prisma.userPoints.findUnique({ where: { userId }, select: { points: true } })
  ])

  return buildTableView({
    session,
    state: null,
    rules: session?.rules ?? rules,
    daily: null,
    points: pointsRow?.points ?? 0
  })
})

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import {
  findActiveSession, closeSession, voidOrphanedHand, getBlackjackConfig,
  getDailyTotals, buildTableView
} from '@/server/utils/blackjackRuntime'

/**
 * Leaves the table and returns to the mode-select screen.
 *
 * Practice sessions are simply closed — the chips are free, so nothing is lost, and closing
 * them is what makes "Main Menu" stick across a reload instead of dropping the player straight
 * back onto the table.
 *
 * A gamble session with chips still on it is NOT closed here: those chips are real points, and
 * the only route out of them is an explicit cash-out. The client opens the cash-out sheet in
 * that case; this endpoint refuses so a stray request cannot strand someone's points.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event).catch(() => ({}))
  const mode = body?.mode === 'gamble' ? 'gamble' : 'practice'

  let session = await findActiveSession(userId, mode)
  if (session) {
    // An abandoned hand still holding an escrowed wager would otherwise block the leave.
    if (await voidOrphanedHand(userId, session)) {
      session = await findActiveSession(userId, mode)
    }
    if (session) {
      if (mode === 'gamble' && (session.chips > 0 || session.wagered > 0)) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Cash out your chips before leaving the table.'
        })
      }
      await closeSession(userId, session.id, mode)
    }
  }

  const rules = await getBlackjackConfig()
  const [daily, pointsRow] = await Promise.all([
    getDailyTotals(userId),
    prisma.userPoints.findUnique({ where: { userId }, select: { points: true } })
  ])

  return buildTableView({
    session: null,
    state: null,
    rules,
    daily,
    points: pointsRow?.points ?? 0
  })
})

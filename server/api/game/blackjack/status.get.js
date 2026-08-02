import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import {
  getBlackjackConfig, getDailyTotals, findActiveSession, settleStaleSessions,
  buildTableView, voidOrphanedHand
} from '@/server/utils/blackjackRuntime'

/**
 * Everything the page needs to render on load: the table's rules, today's remaining buy-in and
 * winnings, the player's balance, and a resumable session if they left one open.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Chips left on a table overnight are returned here rather than by a scheduled job, so the
  // player sees them back in their balance the moment they next open the page.
  const autoCashedOut = await settleStaleSessions(userId).catch(() => null)

  const rules = await getBlackjackConfig()
  const [daily, gamble, practice, pointsRow] = await Promise.all([
    getDailyTotals(userId),
    findActiveSession(userId, 'gamble'),
    findActiveSession(userId, 'practice'),
    prisma.userPoints.findUnique({ where: { userId }, select: { points: true } })
  ])

  let session = gamble || practice

  // A hand may still be in flight from a previous visit. Only its public view is ever sent.
  let state = null
  if (session) {
    const raw = await redis.get(`bj:hand:${userId}`).catch(() => null)
    if (raw) {
      const stored = JSON.parse(raw)
      if (stored.sessionId === session.id) state = stored.state
    }
    // Marked mid-hand but the hand is gone: return the stake now, so the table the player
    // comes back to is one they can actually act on.
    if (!state && await voidOrphanedHand(userId, session)) {
      session = await findActiveSession(userId, session.mode)
    }
  }

  return buildTableView({
    session,
    state,
    rules: session?.rules ?? rules,
    daily,
    points: pointsRow?.points ?? 0,
    extra: {
      hasPractice: Boolean(practice),
      hasGamble: Boolean(gamble),
      // Surfaced so the page can tell the player what happened instead of their chips
      // silently turning back into points between visits.
      autoCashedOut: autoCashedOut ?? 0
    }
  })
})

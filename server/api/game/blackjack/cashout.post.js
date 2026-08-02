import { defineEventHandler, createError } from 'h3'
import {
  getDailyTotals, findActiveSession, cashOutSession, buildTableView, voidOrphanedHand
} from '@/server/utils/blackjackRuntime'

/**
 * Converts the chip stack back to points and closes the table.
 *
 * No session id is read from the request — it is derived from the authenticated user, so
 * cashing out someone else's table isn't something that has to be checked for.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  let session = await findActiveSession(userId, 'gamble')
  if (!session) throw createError({ statusCode: 409, statusMessage: 'No table to cash out.' })

  // Cash-out refuses to run mid-hand so it cannot bank a stake that is still in play. If the
  // hand behind that flag no longer exists, the stake is returned here rather than leaving the
  // player unable to collect until they happen to attempt a move.
  if (await voidOrphanedHand(userId, session)) {
    session = await findActiveSession(userId, 'gamble')
    if (!session) throw createError({ statusCode: 409, statusMessage: 'No table to cash out.' })
  }

  let result
  try {
    result = await cashOutSession(userId, session.id)
  } catch (err) {
    throw createError({
      statusCode: err?.statusCode ?? 500,
      statusMessage: err?.statusCode ? err.statusMessage : 'Could not cash out. Please try again.'
    })
  }

  const daily = await getDailyTotals(userId)

  return buildTableView({
    session: null,
    state: null,
    rules: session.rules,
    daily,
    points: result.pointsAfter,
    extra: { cashedOut: result.cashedOut }
  })
})

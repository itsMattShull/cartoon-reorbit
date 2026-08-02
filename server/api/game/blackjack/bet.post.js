import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import {
  getDailyTotals, findActiveSession, placeBet, buildTableView
} from '@/server/utils/blackjackRuntime'
import { BET_INCREMENT, maxBetForHeadroom } from '@/server/utils/blackjackEngine'

// A bet is `{ mode, bet, version }` — a few dozen bytes. Gate on content-length before
// readBody parses anything, so an oversized body is refused rather than buffered.
const MAX_BODY_BYTES = 1024

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  if (Number(event.node.req.headers['content-length'] || 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  const mode = body?.mode === 'practice' ? 'practice' : 'gamble'

  const bet = body?.bet
  // Strict integer check. `Number.isInteger` is what rejects NaN, Infinity and 12.5 in one
  // go; a `> 0` test on a coerced value would let all three through in some form.
  if (typeof bet !== 'number' || !Number.isInteger(bet) || bet <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bet' })
  }
  if (bet % BET_INCREMENT !== 0) {
    throw createError({ statusCode: 400, statusMessage: `Bets must be a multiple of ${BET_INCREMENT}` })
  }

  const session = await findActiveSession(userId, mode)
  if (!session) throw createError({ statusCode: 409, statusMessage: 'No table. Start a game first.' })

  const rules = session.rules
  if (bet < rules.minBet) {
    throw createError({ statusCode: 400, statusMessage: `Minimum bet is ${rules.minBet}` })
  }

  // The daily win cap is enforced by sizing the bet, not by checking whether the cap has
  // already been passed. A player at +2999 of a 3000 cap who is allowed one more max bet can
  // split it, double both hands and win four times the stake — so the permitted bet is
  // headroom / 4, and hitting zero means the session is done for the day.
  let ceiling = rules.maxBet
  if (mode === 'gamble') {
    const daily = await getDailyTotals(userId)
    const headroom = rules.dailyWinLimit - daily.netWinnings
    ceiling = maxBetForHeadroom(session.chips, headroom, rules)
    if (ceiling === 0) {
      throw createError({ statusCode: 409, statusMessage: 'You have reached the daily win limit. Cash out to collect.' })
    }
  } else {
    ceiling = Math.min(rules.maxBet, session.chips)
  }

  if (bet > ceiling) {
    throw createError({ statusCode: 400, statusMessage: `Maximum bet right now is ${ceiling}` })
  }

  let result
  try {
    result = await placeBet(userId, session, bet)
  } catch (err) {
    throw createError({
      statusCode: err?.statusCode ?? 500,
      statusMessage: err?.statusCode ? err.statusMessage : 'Could not deal. Please try again.'
    })
  }

  const [daily, pointsRow] = await Promise.all([
    mode === 'gamble' ? getDailyTotals(userId) : null,
    prisma.userPoints.findUnique({ where: { userId }, select: { points: true } })
  ])

  return buildTableView({
    session: result.session,
    state: result.state,
    rules,
    daily,
    points: pointsRow?.points ?? 0
  })
})

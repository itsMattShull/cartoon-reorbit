import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import {
  getBlackjackConfig, getDailyTotals, findActiveSession, settleStaleSessions,
  startPracticeSession, buyIn, assertBlackjackPlayable, buildTableView
} from '@/server/utils/blackjackRuntime'
import { BET_INCREMENT } from '@/server/utils/blackjackEngine'

const MODES = new Set(['practice', 'gamble'])

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const reason = await assertBlackjackPlayable(userId)
  if (reason) throw createError({ statusCode: 403, statusMessage: reason })

  const body = await readBody(event)

  // A Set, not an object literal: `MODES['__proto__']` on a plain object returns an inherited
  // truthy value and would sail through a naive lookup.
  const mode = body?.mode
  if (typeof mode !== 'string' || !MODES.has(mode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid mode' })
  }

  await settleStaleSessions(userId).catch(() => {})
  const rules = await getBlackjackConfig()

  if (mode === 'practice') {
    const session = await startPracticeSession(userId, rules)
    const pointsRow = await prisma.userPoints.findUnique({ where: { userId }, select: { points: true } })
    return buildTableView({
      session,
      state: null,
      rules: session.rules,
      daily: null,
      points: pointsRow?.points ?? 0
    })
  }

  // ── gamble: a buy-in moves real points, so validate strictly ──
  const amount = body?.amount
  // Strict typeof, not Number(): Number("500"), Number([500]) and Number(true) all coerce to
  // something plausible, and a string would then poison the arithmetic downstream.
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid buy-in amount' })
  }
  if (amount < BET_INCREMENT || amount % BET_INCREMENT !== 0) {
    throw createError({ statusCode: 400, statusMessage: `Buy-in must be a multiple of ${BET_INCREMENT}` })
  }
  if (amount > rules.dailyBuyInLimit) {
    throw createError({ statusCode: 400, statusMessage: 'Buy-in exceeds the daily limit' })
  }

  let result
  try {
    result = await buyIn(userId, amount, rules)
  } catch (err) {
    // Only messages this module raised deliberately are echoed; anything else is generic, so a
    // Prisma or arithmetic error can't describe internal state back to the caller.
    throw createError({
      statusCode: err?.statusCode ?? 500,
      statusMessage: err?.statusCode ? err.statusMessage : 'Could not buy in. Please try again.'
    })
  }

  const [session, daily] = await Promise.all([
    findActiveSession(userId, 'gamble'),
    getDailyTotals(userId)
  ])

  return buildTableView({
    session,
    state: null,
    rules: session.rules,
    daily,
    points: result.pointsAfter
  })
})

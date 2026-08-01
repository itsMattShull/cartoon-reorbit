import { defineEventHandler, createError } from 'h3'
import { redis } from '@/server/utils/redis'
import { BANK_SCRIPT } from '@/server/utils/guessCtoonEngine'
import {
  sessionKey,
  getGuessCtoonConfig,
  bankRun,
  assertPlayable,
  BANKED_TTL_SECONDS
} from '@/server/utils/guessCtoonRuntime'

// "Stop here and keep my streak", also used when the player navigates away.
//
// This is not an exploit route: banking early can never beat answering correctly, so a
// player who bails is strictly giving up expected value. The one thing it must not do is
// pay out for a run with no answers in it — POST /start immediately followed by POST /end
// would otherwise be the cheapest possible way to farm the daily point award. That gate
// lives in bankRun() via minStreakForPoints.
export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const config = await getGuessCtoonConfig()

  let raw
  try {
    // Atomic flip to `banked` — a concurrent /answer game-over and this call cannot both
    // win, so a run is never recorded twice.
    raw = await redis.eval(BANK_SCRIPT, 1, sessionKey(userId), String(BANKED_TTL_SECONDS))
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }

  let result
  try {
    result = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unexpected game state' })
  }

  if (result.error === 'no_session') {
    throw createError({ statusCode: 409, statusMessage: 'Game session not found or expired. Start a new game.' })
  }
  // The run already ended through /answer — report it without recording anything again.
  if (result.error === 'already_banked') {
    return { streak: 0, pointsAwarded: 0, alreadyRecorded: true }
  }

  const denial = await assertPlayable(userId)
  if (denial) throw createError({ statusCode: 403, statusMessage: denial })

  const banked = await bankRun({
    userId,
    streak: result.streak,
    latencies: result.latencies,
    startedAt: result.startedAt,
    config
  })

  return {
    streak: banked.streak,
    pointsAwarded: banked.pointsAwarded,
    minStreakForPoints: config.minStreakForPoints,
    alreadyRecorded: false
  }
})

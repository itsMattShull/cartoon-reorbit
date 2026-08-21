// server/utils/tradeOfferRateLimit.js
// Rate limit for trade-offer creation and countering (server/api/trade/offers.post.js,
// server/api/trade/offers/[id]/counter.post.js).
//
// Modeled on server/utils/lockRequest.js's checkLockRateLimit (same Redis
// INCR+EXPIRE shape), but deliberately fails CLOSED instead of open. A locked
// cToon only ever affects its own owner, so lockRequest.js's "this is not a
// security control" reasoning holds there. A trade offer is sent AT another
// player — free to send (no cToon, no locked points required) once points can
// be requested without offering anything back — so this limiter is the thing
// standing between one account and an unbounded flood of offers landing in
// other players' incoming lists. Failing open on a Redis outage would remove
// that protection at exactly the moment it's easiest to abuse undetected.
import { createError } from 'h3'
import { redis } from '@/server/utils/redis'

const RATE_LIMIT_MAX = 15
const RATE_LIMIT_WINDOW_SEC = 60

export async function checkTradeOfferRateLimit (event, userId) {
  let count
  try {
    const key = `trade-offers:rl:${userId}`
    count = await redis.incr(key)
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
  } catch (err) {
    console.error('[tradeOfferRateLimit] Redis unavailable, failing closed:', err?.message || err)
    throw createError({
      statusCode: 503,
      statusMessage: 'Trade offers are temporarily unavailable. Please try again shortly.'
    })
  }
  if (count > RATE_LIMIT_MAX) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many trade offers sent. Please wait a minute and try again.'
    })
  }
}

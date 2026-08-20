// server/utils/lockRequest.js
// Request-scoped plumbing shared by the two locks routes. Kept out of
// server/utils/lockRules.js so that module stays import-free and testable
// under bare `node --test`.
import { createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

// Toggling a lock is a cheap human action, so this is generous; it exists
// because there is no global rate limiter (see the note in
// server/api/economy/ctoons/search.get.js) and both handlers write to the
// hottest table in the schema.
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_SEC = 60

/**
 * Resolves the acting user, refusing banned accounts.
 *
 * server/middleware/auth.js only verifies the JWT — it does not check `banned` —
 * so `event.context.userId` alone would let a banned account keep manipulating
 * locks. This reads the row directly rather than doing the usual
 * `$fetch('/api/auth/me')` loopback, which costs a self-inflicted HTTP round trip
 * that gets worse exactly when the site is busy.
 */
export async function requireLockActor (event) {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, banned: true, active: true }
  })
  if (!user || user.banned || user.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user.id
}

/** Fails open on a Redis error: this is not a security control. */
export async function checkLockRateLimit (event, userId) {
  try {
    const key = `locks:rl:${userId}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
    if (count > RATE_LIMIT_MAX) {
      throw createError({ statusCode: 429, statusMessage: 'Too many lock changes. Try again in a minute.' })
    }
  } catch (err) {
    if (err?.statusCode === 429) throw err
  }
}

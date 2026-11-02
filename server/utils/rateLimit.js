// server/utils/rateLimit.js
// Tiny fixed-window rate limiter on Redis, for endpoints that let one user look at another user's data (so they can't
// be scraped). Fails OPEN: if Redis is slow or down the request is allowed — a limiter must never take a page down.
import { getRedis } from './redis.js'

const REDIS_DEADLINE_MS = 300

/**
 * @param {string} key  namespaced for you; include the user id
 * @param {{ limit:number, windowSec:number }} opts
 * @returns {Promise<{ allowed:boolean, remaining:number }>}
 */
export async function rateLimit (key, { limit, windowSec }) {
  const redisKey = `rl:${key}`
  let timer
  try {
    const redis = getRedis()
    const work = (async () => {
      const n = await redis.incr(redisKey)
      if (n === 1) await redis.expire(redisKey, windowSec)
      return n
    })()
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('redis deadline')), REDIS_DEADLINE_MS) })
    const n = await Promise.race([work, deadline])
    return { allowed: n <= limit, remaining: Math.max(0, limit - n) }
  } catch {
    return { allowed: true, remaining: limit }
  } finally {
    clearTimeout(timer)
  }
}

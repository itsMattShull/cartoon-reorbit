// server/utils/cache.js
//
// Small Redis-backed read-through cache for expensive, read-mostly API results (leaderboards and
// the like), with two protections that matter when many users hit the same page at once:
//   * single-flight — concurrent misses for a key in this process share ONE loader call instead of
//     each running the same heavy query (the "thundering herd" when a cache entry expires);
//   * fail-open — if Redis is slow or down the loader just runs, so the cache can never take an
//     endpoint down. Redis calls are given a short deadline for exactly that reason.
// Values must be JSON-serializable (leaderboard queries cast to ::int, so no BigInt/Date issues).
import { getRedis } from './redis.js'

const inflight = new Map()
const REDIS_DEADLINE_MS = 400

function withDeadline(promise, ms = REDIS_DEADLINE_MS) {
  let timer
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('redis deadline')), ms) })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/**
 * @template T
 * @param {string} key      cache key (namespaced for you)
 * @param {number} ttlSec   how long a computed value is reused
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
export async function cachedJson(key, ttlSec, loader) {
  const redisKey = `cache:${key}`
  try {
    const hit = await withDeadline(getRedis().get(redisKey))
    if (hit != null) return JSON.parse(hit)
  } catch { /* fail open */ }

  if (inflight.has(redisKey)) return inflight.get(redisKey)

  const p = (async () => {
    const value = await loader()
    try {
      await withDeadline(getRedis().set(redisKey, JSON.stringify(value), 'EX', ttlSec))
    } catch { /* fail open */ }
    return value
  })().finally(() => inflight.delete(redisKey))

  inflight.set(redisKey, p)
  return p
}

/**
 * Cheap "have I already done this?" flags for per-request bookkeeping (daily login award, login
 * log). Fail-open in both directions: if Redis is unreachable, hasFlag() reports false (the caller
 * simply does its normal DB work) and setFlag() silently does nothing.
 */
export async function hasFlag(key) {
  try { return (await withDeadline(getRedis().exists(`flag:${key}`))) === 1 } catch { return false }
}

export async function setFlag(key, ttlSec) {
  try { await withDeadline(getRedis().set(`flag:${key}`, '1', 'EX', ttlSec)) } catch { /* fail open */ }
}

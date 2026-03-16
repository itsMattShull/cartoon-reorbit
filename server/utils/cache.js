import Redis from 'ioredis'

let client

function getClient() {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
    client.on('error', (err) => {
      // Log but don't crash — cache misses fall through to the real source
      console.error('[cache] Redis error:', err.message)
    })
  }
  return client
}

/**
 * Returns the cached value for `key` if present, otherwise calls `fn`,
 * caches its result for `ttlSeconds`, and returns it.
 *
 * On any Redis error the cache is bypassed and `fn` is called directly.
 *
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
export async function getOrSet(key, ttlSeconds, fn) {
  const redis = getClient()
  try {
    const cached = await redis.get(key)
    if (cached !== null) {
      return JSON.parse(cached)
    }
  } catch {
    // Cache unavailable — fall through
    return fn()
  }

  const value = await fn()

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // Best-effort — ignore write failures
  }

  return value
}

/**
 * Deletes a cache key (e.g. after an admin mutation).
 *
 * @param {string} key
 */
export async function invalidate(key) {
  try {
    await getClient().del(key)
  } catch {
    // Best-effort
  }
}

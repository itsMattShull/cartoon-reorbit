import Redis from 'ioredis'

let _redis = null

export function getRedis() {
  if (_redis) return _redis
  _redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  })
  _redis.on('error', (err) => console.error('[Redis]', err.message))
  return _redis
}

export const redis = getRedis()

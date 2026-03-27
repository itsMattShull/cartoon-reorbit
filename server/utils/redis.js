import Redis from 'ioredis'

// ioredis emits console.warn (not an error event) when a password is supplied
// but the Redis server has no auth requirement. Suppress those specific messages
// so they don't flood logs on servers where REDIS_PASSWORD is set in the env
// but Redis runs without auth.
const _origWarn = console.warn.bind(console)
console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : ''
  if (msg.includes('no password is set') || msg.includes('does not require a password')) return
  _origWarn(...args)
}

let _redis = null

export function getRedis() {
  if (_redis) return _redis
  _redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  })
  _redis.on('error', (err) => console.error('[Redis]', err.message))
  return _redis
}

export const redis = getRedis()

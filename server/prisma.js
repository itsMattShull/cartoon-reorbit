// server/prisma.js
import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton with conservative pool sizing and logging.
 *
 * - Limits Postgres connections per Node process via `connection_limit`.
 * - Adds warn/error logging by default; optional slow query logging.
 * - Preserves a single client across hot-reloads in development.
 */

// Build a DATABASE_URL with conservative pool size.
function buildUrlWithPool(originalUrl) {
  try {
    if (!originalUrl) return originalUrl
    const u = new URL(originalUrl)
    // Very conservative pool size; can be overridden via env
    const poolSize = Number(process.env.PRISMA_POOL_SIZE || 10)
    // Force, don't append duplicates
    u.searchParams.set('connection_limit', String(Math.max(1, poolSize)))
    // Optional: cap how long to wait for a pooled connection (seconds)
    if (!u.searchParams.has('pool_timeout') && process.env.PRISMA_POOL_TIMEOUT) {
      u.searchParams.set('pool_timeout', String(Number(process.env.PRISMA_POOL_TIMEOUT)))
    }
    return u.toString()
  } catch {
    // If URL parsing fails, fall back to original
    return originalUrl
  }
}

const baseUrl = process.env.DATABASE_URL
const pooledUrl = buildUrlWithPool(baseUrl)

// Configure logging: always warn/error; query logs optionally via env
const enableQueryLogs = process.env.PRISMA_LOG_QUERIES === '1'
const logConfig = [
  enableQueryLogs ? { emit: 'event', level: 'query' } : null,
  { emit: 'stdout', level: 'info'  },
  { emit: 'stdout', level: 'warn'  },
  { emit: 'stdout', level: 'error' }
].filter(Boolean)

// Shared factory so dev can persist a single client
function prismaClientFactory() {
  const client = new PrismaClient({
    datasources: pooledUrl ? { db: { url: pooledUrl } } : undefined,
    errorFormat: 'pretty',
    log: logConfig
  })

  // Only log slow queries to keep noise down (configurable threshold)
  if (enableQueryLogs) {
    const threshold = Number(process.env.PRISMA_SLOW_QUERY_MS || 300)
    client.$on('query', (e) => {
      const dur = Number(e.duration)
      if (isFinite(dur) && dur >= threshold) {
        // Includes SQL and params (safe in server logs)
        console.log(`[Prisma][${dur}ms]`, e.query, e.params)
      }
    })
  }

  // Useful to know when Node is exiting while Prisma is still active
  client.$on('beforeExit', async () => {
    console.warn('[Prisma] beforeExit — disconnecting...')
    try { await client.$disconnect() } catch {}
  })

  return client
}

let prisma
if (process.env.NODE_ENV === 'production') {
  // In production, instantiate once
  prisma = prismaClientFactory()
} else {
  // In development, preserve the client across module reloads
  if (!global.__db) {
    global.__db = prismaClientFactory()
  }
  prisma = global.__db
}

export { prisma }

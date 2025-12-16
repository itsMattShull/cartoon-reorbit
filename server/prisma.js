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
    const poolSize = Number(process.env.PRISMA_POOL_SIZE || 5)
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

  // Ensure engine is connected before use
  client.$connect().catch((e) => {
    console.error('[Prisma] Failed to connect', e)
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

  // Library engine (Prisma 5+) does not support client $on('beforeExit').
  // Instead, register process-level hooks once.
  if (!global.__prismaProcessHooksRegistered) {
    global.__prismaProcessHooksRegistered = true
    const disconnect = async () => {
      try { await client.$disconnect() } catch {}
    }
    process.once('beforeExit', disconnect)
    process.once('SIGINT',  () => { disconnect().finally(() => process.exit(0)) })
    process.once('SIGTERM', () => { disconnect().finally(() => process.exit(0)) })
  }

  return client
}

let prisma
prisma = prismaClientFactory()

export { prisma }

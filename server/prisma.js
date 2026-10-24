// server/prisma.js
// Prisma 7 no longer reads .env itself, and the plain-node workers/scripts (run outside pm2) rely on it.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma client singleton with conservative pool sizing and logging.
 *
 * - Limits Postgres connections per Node process via the pg adapter's pool (`max`).
 * - Adds warn/error logging by default; optional slow query logging.
 * - Preserves a single client across hot-reloads in development.
 */

// Pool options for the pg driver adapter. Prisma 7 dropped the query engine's own pool, so the old
// `connection_limit` / `pool_timeout` URL params no longer do anything — the same env vars now
// size the pg.Pool directly.
function buildPoolConfig() {
  // Pool size; can be overridden via env
  const poolSize = Number(process.env.PRISMA_POOL_SIZE || 20)
  // Cap how long to wait for a pooled connection (seconds; 10s matches Prisma's old default —
  // pg's own default is to wait forever)
  const poolTimeoutSec = Number(process.env.PRISMA_POOL_TIMEOUT || 10)
  return {
    connectionString: process.env.DATABASE_URL,
    max: Math.max(1, poolSize),
    connectionTimeoutMillis: Math.max(1, poolTimeoutSec) * 1000
  }
}

// Configure logging: always warn/error; query logs optionally via env
const enableQueryLogs = process.env.PRISMA_LOG_QUERIES === '1'
const logConfig = [
  enableQueryLogs ? { emit: 'event', level: 'query' } : null,
  { emit: 'stdout', level: 'info'  },
  { emit: 'stdout', level: 'warn'  },
  { emit: 'stdout', level: 'error' }
].filter(Boolean)

const ASSET_SWAP_TZ = 'America/Chicago'
const swapDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ASSET_SWAP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

function getSwapDateParts(date = new Date()) {
  const parts = swapDateFormatter.formatToParts(date)
  const out = {}
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      out[part.type] = Number(part.value)
    }
  }
  return out
}

function getSwapDateKey(date = new Date()) {
  const { year, month, day } = getSwapDateParts(date)
  const mm = String(month || 0).padStart(2, '0')
  const dd = String(day || 0).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function isSwapDay(date = new Date()) {
  const { month, day } = getSwapDateParts(date)
  return month === 4 && day === 1
}

function hashStringToUint32(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6D2B79F5
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function buildDerangementIndices(size, rand) {
  const indices = Array.from({ length: size }, (_, i) => i)
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * i)
    const tmp = indices[i]
    indices[i] = indices[j]
    indices[j] = tmp
  }
  return indices
}

async function buildAssetSwapMap(client, dateKey) {
  const rows = await client.ctoon.findMany({
    select: { id: true, assetPath: true }
  })
  if (rows.length <= 1) {
    return { dateKey, enabled: false, mapById: new Map(), mapByAssetPath: new Map() }
  }

  const rand = mulberry32(hashStringToUint32(dateKey))
  const permutation = buildDerangementIndices(rows.length, rand)
  const mapById = new Map()
  const mapByAssetPath = new Map()

  rows.forEach((row, idx) => {
    const target = rows[permutation[idx]]
    mapById.set(row.id, target.assetPath)
    mapByAssetPath.set(row.assetPath, target.assetPath)
  })

  return { dateKey, enabled: true, mapById, mapByAssetPath }
}

async function getAssetSwapMap(client) {
  if (!isSwapDay()) return null

  const dateKey = getSwapDateKey()
  const cached = globalThis.__assetSwapCache
  if (cached?.dateKey === dateKey) return cached

  const inflight = globalThis.__assetSwapCachePromise
  if (inflight?.dateKey === dateKey) return inflight.promise

  const promise = (async () => {
    try {
      return await buildAssetSwapMap(client, dateKey)
    } catch (err) {
      console.error('[Prisma] Asset swap map failed', err)
      return { dateKey, enabled: false, mapById: new Map(), mapByAssetPath: new Map() }
    }
  })()

  globalThis.__assetSwapCachePromise = { dateKey, promise }
  const next = await promise
  globalThis.__assetSwapCache = next
  if (globalThis.__assetSwapCachePromise?.dateKey === dateKey) {
    delete globalThis.__assetSwapCachePromise
  }

  return next
}

function applyAssetSwap(value, swapMap) {
  if (!swapMap?.enabled) return value

  if (Array.isArray(value)) {
    return value.map((item) => applyAssetSwap(item, swapMap))
  }

  if (!value || typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (Buffer.isBuffer(value)) return value

  if (Object.prototype.hasOwnProperty.call(value, 'assetPath') && typeof value.assetPath === 'string') {
    const idKey = typeof value.id === 'string' ? value.id : null
    const replacement = (idKey && swapMap.mapById.get(idKey)) || swapMap.mapByAssetPath.get(value.assetPath)
    if (replacement && replacement !== value.assetPath) {
      value.assetPath = replacement
    }
  }

  for (const [key, child] of Object.entries(value)) {
    value[key] = applyAssetSwap(child, swapMap)
  }

  return value
}

// Shared factory so dev can persist a single client
function prismaClientFactory() {
  let exportedBaseClient
  const baseClient = new PrismaClient({
    adapter: new PrismaPg(buildPoolConfig()),
    errorFormat: 'pretty',
    log: logConfig
  })

  // Ensure the database is reachable before first use
  baseClient.$connect().catch((e) => {
    console.error('[Prisma] Failed to connect', e)
  })

  // Only log slow queries to keep noise down (configurable threshold)
  if (enableQueryLogs) {
    const threshold = Number(process.env.PRISMA_SLOW_QUERY_MS || 300)
    baseClient.$on('query', (e) => {
      const dur = Number(e.duration)
      if (isFinite(dur) && dur >= threshold) {
        // Includes SQL and params (safe in server logs)
        console.log(`[Prisma][${dur}ms]`, e.query, e.params)
      }
    })
  }

  // The client has no 'beforeExit' hook; register process-level hooks once instead.
  if (!globalThis.__prismaProcessHooksRegistered) {
    globalThis.__prismaProcessHooksRegistered = true
    const disconnect = async () => {
      try { await baseClient.$disconnect() } catch {}
    }
    process.once('beforeExit', disconnect)
    process.once('SIGINT',  () => { disconnect().finally(() => process.exit(0)) })
    process.once('SIGTERM', () => { disconnect().finally(() => process.exit(0)) })
  }

  exportedBaseClient = baseClient

  const prisma = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Fast path: skip all overhead on non-swap days (99.7% of the time)
          if (!isSwapDay()) return query(args)
          const result = await query(args)
          const swapMap = await getAssetSwapMap(baseClient)
          return applyAssetSwap(result, swapMap)
        }
      },
      userCtoon: {
        // First Edition is a property of the cToon template, not the mint: force
        // isFirstEdition = NOT ctoon.isSecondEdition on every mint, regardless of what
        // the many call sites pass in. Keeps all mint paths correct from one place.
        async create({ args, query }) {
          const ctoonId = args?.data?.ctoonId
          if (ctoonId) {
            const parent = await baseClient.ctoon.findUnique({
              where: { id: ctoonId },
              select: { isSecondEdition: true }
            })
            if (parent) args.data.isFirstEdition = !parent.isSecondEdition
          }
          return query(args)
        }
      }
    }
  })

  return { prisma, rawPrisma: exportedBaseClient }
}

let prisma
let rawPrisma
;({ prisma, rawPrisma } = prismaClientFactory())

export { prisma, rawPrisma }

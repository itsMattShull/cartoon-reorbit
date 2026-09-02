// GET /api/economy/ctoons/:id/auctions?limit=
// Live, real closed-auction sale prices for one cToon — individual points,
// not the imputed/blended CtoonPriceDaily aggregate history.get.js reads.
// Supplements history.get.js; it does not replace it (the modal falls back to
// the aggregate when insufficientData is true).
import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { isSystemSale } from '@/server/utils/auctionPriceSuggestion'
import { getSystemUserIds } from '@/server/utils/systemAccounts'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
// Read extra rows so that dropping system-account sales still leaves a full
// page — same compensation pattern as getRecentAuctions.get.js's FETCH_COUNT.
const FETCH_MULTIPLIER = 2

const CACHE_TTL_SEC = 60
const LOCK_TTL_MS = 5000

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SEC = 60

async function checkRateLimit(userId) {
  const key = `economy:ctoon-history-rl:${userId}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
  return count <= RATE_LIMIT_MAX
}

function parseLimit(raw) {
  const n = parseInt(Array.isArray(raw) ? raw[0] : raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, n)
}

async function computePayload(ctoonId, limit) {
  const systemUserIds = await getSystemUserIds()
  const baseWhere = { status: 'CLOSED', winnerId: { not: null }, userCtoon: { ctoonId } }

  // Two small indexed counts (on @@index([userCtoonId, status, winnerAt]) via
  // the userCtoon relation filter) rather than deriving the total from the
  // fetched page — a page that happens to catch 2 system sales and 1 real one
  // must not read as "enough data" for a cToon with exactly one real sale ever.
  const [rows, totalClosed, systemClosed] = await Promise.all([
    prisma.auction.findMany({
      where: baseWhere,
      orderBy: { winnerAt: 'desc' },
      take: limit * FETCH_MULTIPLIER,
      select: {
        highestBid: true,
        winnerAt: true,
        winnerId: true,
        userCtoon: { select: { mintNumber: true } }
      }
    }),
    prisma.auction.count({ where: baseWhere }),
    prisma.auction.count({ where: { ...baseWhere, winnerId: { in: systemUserIds } } })
  ])

  const totalSales = Math.max(0, totalClosed - systemClosed)
  const real = rows.filter(r => !isSystemSale(r, systemUserIds))

  if (totalSales < MIN_SAMPLE_SIZE) {
    return { ctoonId, insufficientData: true, totalSales, points: [] }
  }

  const points = real.slice(0, limit).map(r => ({
    price: r.highestBid,
    soldAt: r.winnerAt,
    mintNumber: r.userCtoon?.mintNumber ?? null
  }))

  return { ctoonId, insufficientData: false, totalSales, points }
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const ctoonId = getRouterParam(event, 'id')
  if (!ctoonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cToon id' })
  }

  try {
    const allowed = await checkRateLimit(event.context.userId)
    if (!allowed) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests, slow down.' })
    }
  } catch (err) {
    if (err?.statusCode === 429) throw err
    // Redis unavailable — fail open, this endpoint has no expensive fan-out.
  }

  const limit = parseLimit(getQuery(event).limit)
  const cacheKey = `economy:ctoon-auctions:v1:${ctoonId}:${limit}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const lockKey = `${cacheKey}:lock`
  let haveLock = false
  try {
    haveLock = (await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX')) === 'OK'
  } catch {}

  if (!haveLock) {
    // Someone else is already recomputing this exact key — give them a moment
    // to finish and populate the cache rather than piling on a duplicate query.
    await new Promise(resolve => setTimeout(resolve, 150))
    try {
      const cached = await redis.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch {}
  }

  try {
    const payload = await computePayload(ctoonId, limit)
    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL_SEC)
    } catch {}
    return payload
  } finally {
    if (haveLock) {
      try { await redis.del(lockKey) } catch {}
    }
  }
})

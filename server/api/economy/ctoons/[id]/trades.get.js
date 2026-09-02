// GET /api/economy/ctoons/:id/trades?limit=
// Live, individually-plotted imputed trade values for one cToon (per-trade,
// not the daily-blended average history.get.js reads). Each accepted trade's
// value is imputed the same way server/cron/economy-aggregate.js's
// aggregateTrades() prices it for CtoonPriceDaily, so the two agree — but this
// endpoint additionally applies the mint-number premium for the specific copy
// that was actually traded, and returns one point per trade instead of one
// blended point per day.
import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getAuctionReferenceValues, getCmartPrices, pickReferenceValue, MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { mintMultiplier } from '@/server/utils/auctionPriceSuggestion'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
// Trades touching this cToon are rare compared to auctions, so fetch a wider
// window up front rather than compensating for a filtered-out slice after —
// unlike auctions.get.js there's no "system sale" to drop here.
const FETCH_MULTIPLIER = 3

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
  const offerIdRows = await prisma.tradeOfferCtoon.findMany({
    where: { userCtoon: { ctoonId }, tradeOffer: { status: 'ACCEPTED' } },
    select: { tradeOfferId: true },
    distinct: ['tradeOfferId']
  })
  const offerIds = offerIdRows.map(r => r.tradeOfferId)

  if (!offerIds.length) {
    return { ctoonId, insufficientData: true, totalTrades: 0, points: [] }
  }

  const offers = await prisma.tradeOffer.findMany({
    where: { id: { in: offerIds } },
    orderBy: { updatedAt: 'desc' },
    take: limit * FETCH_MULTIPLIER,
    select: {
      id: true,
      updatedAt: true,
      pointsOffered: true,
      ctoons: { select: { userCtoon: { select: { ctoonId: true, mintNumber: true } } } }
    }
  })

  const allCtoonIds = [...new Set(offers.flatMap(o => o.ctoons.map(c => c.userCtoon.ctoonId)))]
  const [auctionRefs, cmartPrices, mintAggs, ctoonRec, holidayRec] = await Promise.all([
    getAuctionReferenceValues(allCtoonIds),
    getCmartPrices(allCtoonIds),
    prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: { ctoonId: { in: allCtoonIds } },
      _max: { mintNumber: true }
    }),
    prisma.ctoon.findUnique({ where: { id: ctoonId }, select: { quantity: true } }),
    prisma.holidayEventItem.findFirst({ where: { ctoonId }, select: { id: true } })
  ])
  const highestMintByCtoonId = new Map(mintAggs.map(row => [row.ctoonId, row._max.mintNumber]))
  const highestMint = highestMintByCtoonId.get(ctoonId) ?? null
  const mintOpts = { isUnlimited: ctoonRec?.quantity == null, isHolidayItem: !!holidayRec }

  const points = []
  for (const offer of offers) {
    const ctoonIds = offer.ctoons.map(c => c.userCtoon.ctoonId)
    if (!ctoonIds.length) continue

    let knownValueSum = offer.pointsOffered || 0
    let knownCount = 0
    for (const cId of ctoonIds) {
      const ref = pickReferenceValue(cId, auctionRefs, cmartPrices)
      if (ref != null) {
        knownValueSum += ref
        knownCount++
      }
    }
    if (knownCount === 0) continue // nothing priceable in this trade, same as the cron's null-handling

    const impliedValue = knownValueSum / knownCount

    // Applied once, for the specific copy of `ctoonId` that changed hands in
    // this trade — a trade can only carry one userCtoon row per (offer, role,
    // ctoon) so there's exactly one mint to pick per matching leg.
    const tradedLeg = offer.ctoons.find(c => c.userCtoon.ctoonId === ctoonId)
    const mintNumber = tradedLeg?.userCtoon?.mintNumber ?? null
    const multiplier = mintMultiplier(mintNumber, highestMint, mintOpts)

    points.push({
      value: Math.round(impliedValue * multiplier),
      tradedAt: offer.updatedAt,
      mintNumber
    })
  }

  const totalTrades = points.length
  if (totalTrades < MIN_SAMPLE_SIZE) {
    return { ctoonId, insufficientData: true, totalTrades, points: [] }
  }

  return { ctoonId, insufficientData: false, totalTrades, points: points.slice(0, limit) }
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
  }

  const limit = parseLimit(getQuery(event).limit)
  const cacheKey = `economy:ctoon-trades:v1:${ctoonId}:${limit}`

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

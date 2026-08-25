// GET /api/collection/self/worth
// "Collection Worth" summary for the calling user's My Collection page
// (components/newsite/MyCollection.vue): four total-value metrics computed
// over every cToon the user currently owns.
//
// No caller-supplied parameters — this only ever prices the authenticated
// user's own collection (event.context.userId, set by server/middleware/auth.js),
// mirroring server/api/collection/self/summary.get.js rather than the heavier
// self-fetch-/api/auth/me pattern collections.get.js uses.
import { defineEventHandler, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'
import {
  getDailyReferenceValues,
  computeCollectionWorth,
  MAX_WORTH_CTOON_TYPES
} from '@/server/utils/collectionWorth'

// Bounded by economyFreshness.js's 300s aggregation gate, same as the Economy
// endpoints — a shorter TTL can't surface fresher avg-auction/avg-trade data,
// it would just multiply cold-cache recomputes.
const CACHE_TTL = 300
const cacheKey = (userId) => `collection-worth:${userId}:v1`

const EMPTY_RESULT = {
  itemCount: 0,
  distinctCount: 0,
  truncated: false,
  totals: { faceValue: 0, avgAuctionSold: 0, avgTraded: 0, lastAuctionSold: 0 },
  priced: { avgAuctionSold: 0, avgTraded: 0, lastAuctionSold: 0 },
  asOf: null
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  setHeader(event, 'Cache-Control', 'no-store')

  const key = cacheKey(userId)
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch {}

  const owned = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { userId, burnedAt: null },
    _count: { _all: true }
  })

  if (!owned.length) return EMPTY_RESULT

  const truncated = owned.length > MAX_WORTH_CTOON_TYPES
  const ownedRows = truncated ? owned.slice(0, MAX_WORTH_CTOON_TYPES) : owned
  const ctoonIds = ownedRows.map(r => r.ctoonId)

  const [ctoonRows] = await Promise.all([
    prisma.ctoon.findMany({
      where: { id: { in: ctoonIds } },
      select: { id: true, price: true, lastAuctionSoldPrice: true }
    }),
    ensureEconomyDataFresh()
  ])
  const ctoonById = new Map(ctoonRows.map(c => [c.id, c]))

  const { auction: auctionRefs, trade: tradeRefs } = await getDailyReferenceValues(ctoonIds)

  const ctoons = new Map()
  for (const row of ownedRows) {
    const ctoon = ctoonById.get(row.ctoonId)
    if (!ctoon) continue // deleted cToon record; nothing to price
    ctoons.set(row.ctoonId, {
      quantity: row._count._all,
      facePrice: ctoon.price,
      lastAuctionSoldPrice: ctoon.lastAuctionSoldPrice
    })
  }

  const { itemCount, distinctCount, totals, priced } = computeCollectionWorth(ctoons, auctionRefs, tradeRefs)

  const result = { itemCount, distinctCount, truncated, totals, priced, asOf: new Date().toISOString() }

  try {
    await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  } catch {}

  return result
})

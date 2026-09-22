// GET /api/admin/collection-worth?username=
// Admin "Manage Collection" counterpart to /api/collection/self/worth — same
// four valuation metrics (avg auction sale, last auction sold, avg trade
// value, cMart/face price), computed for an admin-supplied target user
// instead of the calling session. Reuses the exact same pure valuation
// helpers and the exact same Redis cache key as the self-service endpoint
// (server/api/collection/self/worth.get.js) since the number for a given
// userId is identical either way — an admin looking at a user right after
// they checked their own page gets a free cache hit instead of a duplicate
// recompute.
import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { requireAdminBySession } from '@/server/utils/adminAuth'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'
import {
  getDailyReferenceValues,
  computeCollectionWorth,
  MAX_WORTH_CTOON_TYPES
} from '@/server/utils/collectionWorth'

const CACHE_TTL = 300
const cacheKey = (userId) => `collection-worth:${userId}:v1`

const emptyResult = (target) => ({
  username: target.username,
  userId: target.id,
  itemCount: 0,
  distinctCount: 0,
  truncated: false,
  totals: { faceValue: 0, avgAuctionSold: 0, avgTraded: 0, lastAuctionSold: 0 },
  priced: { avgAuctionSold: 0, avgTraded: 0, lastAuctionSold: 0 },
  asOf: null
})

export default defineEventHandler(async (event) => {
  await requireAdminBySession(event)

  const username = getQuery(event).username?.trim()
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  const target = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  setHeader(event, 'Cache-Control', 'no-store')

  const key = cacheKey(target.id)
  try {
    const cached = await redis.get(key)
    if (cached) return { ...JSON.parse(cached), username: target.username, userId: target.id }
  } catch {}

  const owned = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { userId: target.id, burnedAt: null },
    _count: { _all: true }
  })

  if (!owned.length) return emptyResult(target)

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
    if (!ctoon) continue
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

  return { ...result, username: target.username, userId: target.id }
})

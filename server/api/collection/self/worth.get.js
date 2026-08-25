// GET /api/collection/self/worth
// Estimated total value of the calling user's collection, for the "Collection
// Worth" badge on My Collection (components/newsite/MyCollection.vue). Uses
// the exact same per-mint valuation the Owners tab in the cToon Info Modal
// already shows (see server/utils/collectionWorth.js) so the two can never
// disagree on what a given mint is worth.
//
// No caller-supplied parameters — this only ever prices the authenticated
// user's own collection (event.context.userId, set by
// server/middleware/auth.js), mirroring server/api/collection/self/summary.get.js
// rather than the heavier self-fetch-/api/auth/me pattern collections.get.js uses.
import { defineEventHandler, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import {
  getAuctionReferenceValues,
  getFaceAndMintData,
  computeCollectionWorth,
  MAX_WORTH_CTOON_TYPES
} from '@/server/utils/collectionWorth'

// No freshness gate to wait on here (unlike the Economy endpoints) — this
// reads straight from the Auction/Ctoon tables, same as
// /api/ctoon/valuations.post.js, so a short cache is purely about not
// recomputing on every page load, not about bounding staleness.
const CACHE_TTL = 300
const cacheKey = (userId) => `collection-worth:${userId}:v2`

const EMPTY_RESULT = { itemCount: 0, distinctCount: 0, truncated: false, total: 0, asOf: null }

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

  const owned = await prisma.userCtoon.findMany({
    where: { userId, burnedAt: null },
    select: { ctoonId: true, mintNumber: true }
  })

  if (!owned.length) return EMPTY_RESULT

  const allCtoonIds = [...new Set(owned.map(o => o.ctoonId))]
  const truncated = allCtoonIds.length > MAX_WORTH_CTOON_TYPES
  const ctoonIds = truncated ? allCtoonIds.slice(0, MAX_WORTH_CTOON_TYPES) : allCtoonIds
  const ownedCopies = truncated
    ? (() => { const keep = new Set(ctoonIds); return owned.filter(o => keep.has(o.ctoonId)) })()
    : owned

  const [avgSaleByCtoonId, { faceByCtoonId, highestMintByCtoonId }] = await Promise.all([
    getAuctionReferenceValues(ctoonIds),
    getFaceAndMintData(ctoonIds)
  ])

  const { itemCount, distinctCount, total } = computeCollectionWorth(
    ownedCopies, avgSaleByCtoonId, faceByCtoonId, highestMintByCtoonId
  )

  const result = { itemCount, distinctCount, truncated, total, asOf: new Date().toISOString() }

  try {
    await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  } catch {}

  return result
})

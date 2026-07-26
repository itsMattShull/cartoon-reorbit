// server/utils/activeSaleCache.js
// Short-lived in-memory cache for the currently active cMart Sale, mirroring
// the pattern in upgradesConfigCache.js. Cleared from the admin sale
// create/update/delete routes so changes show up promptly; otherwise expires
// on its own so a sale's start/end boundary is never more than TTL stale.

import { prisma } from '@/server/prisma'

export const CACHE_TTL_MS = 30 * 1000 // 30 seconds

// Lookahead window for the "featured" sale (active OR starting soon) shown
// in the cMart showcase, so shoppers see a countdown before it goes live.
export const FEATURED_LOOKAHEAD_MS = 24 * 60 * 60 * 1000 // 24 hours

let _cache = null
let _cacheAt = 0

let _featuredCache = null
let _featuredCacheAt = 0

export function clearActiveSaleCache() {
  _cache = null
  _cacheAt = 0
  _featuredCache = null
  _featuredCacheAt = 0
}

export function setActiveSaleCache(value) {
  _cache = value
  _cacheAt = Date.now()
}

export function getActiveSaleCache() {
  if (_cache !== null && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache
  }
  return undefined
}

function setFeaturedSaleCache(value) {
  _featuredCache = value
  _featuredCacheAt = Date.now()
}

function getFeaturedSaleCache() {
  if (_featuredCache !== null && Date.now() - _featuredCacheAt < CACHE_TTL_MS) {
    return _featuredCache
  }
  return undefined
}

// Fetches the currently active Sale (with items), using the short-lived
// cache above. Shared by the public cMart showcase endpoint and anywhere
// else (e.g. the cToon info modal) that needs to know if a given cToon is
// currently on sale.
export async function getActiveSale() {
  const cached = getActiveSaleCache()
  if (cached !== undefined) return cached

  const now = new Date()
  const sale = await prisma.sale.findFirst({
    where: { startAt: { lte: now }, endAt: { gte: now } },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      name: true,
      imagePath: true,
      endAt: true,
      items: {
        select: {
          price: true,
          perDayLimit: true,
          ctoon: {
            select: {
              id: true,
              name: true,
              assetPath: true,
              rarity: true,
              price: true,
              isGtoon: true,
              quantity: true,
              totalMinted: true,
              isSecondEdition: true,
              secondEditionOverlayX: true,
              secondEditionOverlayY: true,
              secondEditionOverlaySize: true
            }
          }
        }
      }
    }
  })

  const result = sale || null
  setActiveSaleCache(result)
  return result
}

// Fetches the Sale to feature in the cMart showcase: either the currently
// active one, or (if none) one starting within the next 24h, so shoppers see
// a countdown before it goes live. A single range query ordered by startAt
// asc naturally prefers an active sale over an upcoming one, since an active
// sale's startAt is always <= now, which sorts before any upcoming sale's
// startAt (necessarily > now).
//
// This is display-only: it must never be used to decide whether a purchase
// is allowed (see buy.post.js / mint.worker.js, which always re-derive the
// strictly-active sale themselves).
export async function getFeaturedSale() {
  const cached = getFeaturedSaleCache()
  if (cached !== undefined) return cached

  const now = new Date()
  const lookaheadEnd = new Date(now.getTime() + FEATURED_LOOKAHEAD_MS)
  const sale = await prisma.sale.findFirst({
    where: { startAt: { lte: lookaheadEnd }, endAt: { gte: now } },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      name: true,
      imagePath: true,
      startAt: true,
      endAt: true,
      items: {
        select: {
          price: true,
          perDayLimit: true,
          ctoon: {
            select: {
              id: true,
              name: true,
              assetPath: true,
              rarity: true,
              price: true,
              isGtoon: true,
              quantity: true,
              totalMinted: true,
              isSecondEdition: true,
              secondEditionOverlayX: true,
              secondEditionOverlayY: true,
              secondEditionOverlaySize: true
            }
          }
        }
      }
    }
  })

  const result = sale || null
  setFeaturedSaleCache(result)
  return result
}

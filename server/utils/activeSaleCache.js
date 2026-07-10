// server/utils/activeSaleCache.js
// Short-lived in-memory cache for the currently active cMart Sale, mirroring
// the pattern in upgradesConfigCache.js. Cleared from the admin sale
// create/update/delete routes so changes show up promptly; otherwise expires
// on its own so a sale's start/end boundary is never more than TTL stale.

import { prisma } from '@/server/prisma'

export const CACHE_TTL_MS = 30 * 1000 // 30 seconds

let _cache = null
let _cacheAt = 0

export function clearActiveSaleCache() {
  _cache = null
  _cacheAt = 0
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

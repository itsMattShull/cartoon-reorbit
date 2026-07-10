// GET /api/cmart/active-sale
// Public endpoint. Returns the currently active Sale (if any) with its items,
// for the cMart showcase section. Cached briefly (mirrors upgradesConfigCache.js)
// since this is fetched on every cMart page load and refresh cycle, and there's
// usually no active sale.

import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { getActiveSaleCache, setActiveSaleCache } from '@/server/utils/activeSaleCache'

export default defineEventHandler(async () => {
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
})

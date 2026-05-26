// server/api/cmart/upgrades-config.get.js
// Returns cMart upgrade costs with a 10-minute in-memory cache.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import {
  getUpgradesConfigCache,
  setUpgradesConfigCache,
  clearUpgradesConfigCache
} from '@/server/utils/upgradesConfigCache'

// Re-export so any legacy imports still resolve (belt-and-suspenders)
export { clearUpgradesConfigCache }

export default defineEventHandler(async () => {
  const cached = getUpgradesConfigCache()
  if (cached) return cached

  const cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })

  const result = {
    firstAdditionalCzoneCost:      cfg?.firstAdditionalCzoneCost      ?? 25000,
    subsequentAdditionalCzoneCost: cfg?.subsequentAdditionalCzoneCost ?? 50000,
    cmartHalfPriceEnabled:         cfg?.cmartHalfPriceEnabled         ?? false
  }
  setUpgradesConfigCache(result)
  return result
})

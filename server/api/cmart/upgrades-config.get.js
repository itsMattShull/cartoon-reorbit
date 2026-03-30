// server/api/cmart/upgrades-config.get.js
// Returns cMart upgrade costs with a 10-minute in-memory cache.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
let _cache = null
let _cacheAt = 0

export default defineEventHandler(async () => {
  const now = Date.now()
  if (_cache && now - _cacheAt < CACHE_TTL_MS) {
    return _cache
  }

  const cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })

  _cache = {
    firstAdditionalCzoneCost:      cfg?.firstAdditionalCzoneCost      ?? 25000,
    subsequentAdditionalCzoneCost: cfg?.subsequentAdditionalCzoneCost ?? 50000
  }
  _cacheAt = now
  return _cache
})

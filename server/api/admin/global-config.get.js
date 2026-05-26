// server/api/admin/global-config.get.js
import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

const DEFAULT_TIME_BASED_PURCHASE_LIMITS = {
  'Common':     { count: 5, windowDays: null },
  'Uncommon':   { count: 4, windowDays: null },
  'Rare':       { count: 3, windowDays: null },
  'Very Rare':  { count: 2, windowDays: null },
  'Crazy Rare': { count: 1, windowDays: null }
}

export default defineEventHandler(async (event) => {
  // 1) Authenticate & authorize
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Try to fetch the singleton global config
  let config = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' }
  })

  // 3) If not found, create with defaults
  if (!config) {
    config = await db.globalGameConfig.create({
      data: {
        id: 'singleton',
        dailyPointLimit: 250,
        dailyLoginPoints: 500,
        dailyNewUserPoints: 1000,
        czoneVisitPoints: 20,
        czoneVisitMaxPerDay: 10,
        czoneCount: 3,
        phashDuplicateThreshold: 14,
        dhashDuplicateThreshold: 16,
        featuredAuctionHours: [],
        featuredAuctionIntervalDays: 1,
        featuredAuctionsPerSlot: 1,
        timeBasedPurchaseLimits: DEFAULT_TIME_BASED_PURCHASE_LIMITS
      }
    })
  } else if (!config.timeBasedPurchaseLimits) {
    // Backfill defaults for existing singletons created before this field was added.
    // This ensures the purchase-limit enforcement in the mint worker has data to work with.
    config = await db.globalGameConfig.update({
      where: { id: 'singleton' },
      data: { timeBasedPurchaseLimits: DEFAULT_TIME_BASED_PURCHASE_LIMITS }
    })
  }

  // 4) Return it
  return config
})

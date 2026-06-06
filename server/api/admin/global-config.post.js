// server/api/admin/global-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { clearUpgradesConfigCache } from '@/server/utils/upgradesConfigCache'

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

  // 2) Read + validate payload
  const body = await readBody(event)
  const {
    dailyPointLimit,
    dailyLoginPoints,
    dailyNewUserPoints,
    czoneVisitPoints,
    czoneVisitMaxPerDay,
    czoneCount,
    phashDuplicateThreshold,
    dhashDuplicateThreshold,
    featuredAuctionHours,
    featuredAuctionIntervalDays,
    featuredAuctionsPerSlot,
    cmartHalfPriceEnabled,
    timeBasedPurchaseLimits,
    packPriceDecayAmount,
    packPriceDecayDays,
    packPriceFloor,
    packMaxDefaultBuysPerUser
  } = body

  // minimally require the existing cap; other fields optional with defaults
  if (dailyPointLimit == null || typeof dailyPointLimit !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid "dailyPointLimit", must be a number'
    })
  }

  const payload = {
    dailyPointLimit: Number(dailyPointLimit),
    // allow partial updates; coerce to number if provided else keep existing via upsert+update
    dailyLoginPoints:   (typeof dailyLoginPoints   === 'number') ? Number(dailyLoginPoints)   : undefined,
    dailyNewUserPoints: (typeof dailyNewUserPoints === 'number') ? Number(dailyNewUserPoints) : undefined,
    czoneVisitPoints:   (typeof czoneVisitPoints   === 'number') ? Number(czoneVisitPoints)   : undefined,
    czoneVisitMaxPerDay:(typeof czoneVisitMaxPerDay=== 'number') ? Number(czoneVisitMaxPerDay): undefined,
    czoneCount:         (typeof czoneCount         === 'number') ? Number(czoneCount)         : undefined,
    phashDuplicateThreshold: (typeof phashDuplicateThreshold === 'number') ? Number(phashDuplicateThreshold) : undefined,
    dhashDuplicateThreshold: (typeof dhashDuplicateThreshold === 'number') ? Number(dhashDuplicateThreshold) : undefined,
    featuredAuctionHours: Array.isArray(featuredAuctionHours)
      ? featuredAuctionHours.map(Number).filter(h => h >= 0 && h <= 23)
      : undefined,
    featuredAuctionIntervalDays: (typeof featuredAuctionIntervalDays === 'number') ? Math.max(1, featuredAuctionIntervalDays) : undefined,
    featuredAuctionsPerSlot: (typeof featuredAuctionsPerSlot === 'number') ? Number(featuredAuctionsPerSlot) : undefined,
    cmartHalfPriceEnabled: (typeof cmartHalfPriceEnabled === 'boolean') ? cmartHalfPriceEnabled : undefined,
    timeBasedPurchaseLimits: (timeBasedPurchaseLimits !== undefined && timeBasedPurchaseLimits !== null)
      ? timeBasedPurchaseLimits
      : undefined,
    packPriceDecayAmount:      (typeof packPriceDecayAmount      === 'number') ? Math.max(0, packPriceDecayAmount)      : undefined,
    packPriceDecayDays:        (typeof packPriceDecayDays        === 'number') ? Math.max(1, packPriceDecayDays)        : undefined,
    packPriceFloor:            (typeof packPriceFloor            === 'number') ? Math.max(0, packPriceFloor)            : undefined,
    packMaxDefaultBuysPerUser: (typeof packMaxDefaultBuysPerUser === 'number') ? Math.max(1, packMaxDefaultBuysPerUser) : undefined
  }

  // 3) Upsert the singleton global config row
  try {
    const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    const result = await db.globalGameConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        dailyPointLimit: payload.dailyPointLimit,
        dailyLoginPoints:   payload.dailyLoginPoints   ?? 500,
        dailyNewUserPoints: payload.dailyNewUserPoints ?? 1000,
        czoneVisitPoints:   payload.czoneVisitPoints   ?? 20,
        czoneVisitMaxPerDay: payload.czoneVisitMaxPerDay ?? 10,
        czoneCount: payload.czoneCount ?? 3,
        phashDuplicateThreshold: payload.phashDuplicateThreshold ?? 14,
        dhashDuplicateThreshold: payload.dhashDuplicateThreshold ?? 16,
        featuredAuctionHours: payload.featuredAuctionHours ?? [],
        featuredAuctionIntervalDays: payload.featuredAuctionIntervalDays ?? 1,
        featuredAuctionsPerSlot: payload.featuredAuctionsPerSlot ?? 1,
        cmartHalfPriceEnabled: payload.cmartHalfPriceEnabled ?? false,
        timeBasedPurchaseLimits: payload.timeBasedPurchaseLimits ?? {
          'Common':     { count: 5, windowDays: null },
          'Uncommon':   { count: 4, windowDays: null },
          'Rare':       { count: 3, windowDays: null },
          'Very Rare':  { count: 2, windowDays: null },
          'Crazy Rare': { count: 1, windowDays: null }
        },
        packPriceDecayAmount:      payload.packPriceDecayAmount      ?? 100,
        packPriceDecayDays:        payload.packPriceDecayDays        ?? 7,
        packPriceFloor:            payload.packPriceFloor            ?? 700,
        packMaxDefaultBuysPerUser: payload.packMaxDefaultBuysPerUser ?? 5
      },
      update: {
        dailyPointLimit: payload.dailyPointLimit,
        // only update fields that were provided
        ...(payload.dailyLoginPoints   !== undefined ? { dailyLoginPoints:   payload.dailyLoginPoints }   : {}),
        ...(payload.dailyNewUserPoints !== undefined ? { dailyNewUserPoints: payload.dailyNewUserPoints } : {}),
        ...(payload.czoneVisitPoints    !== undefined ? { czoneVisitPoints:    payload.czoneVisitPoints }    : {}),
        ...(payload.czoneVisitMaxPerDay !== undefined ? { czoneVisitMaxPerDay: payload.czoneVisitMaxPerDay } : {}),
        ...(payload.czoneCount          !== undefined ? { czoneCount:          payload.czoneCount }          : {}),
        ...(payload.phashDuplicateThreshold !== undefined ? { phashDuplicateThreshold: payload.phashDuplicateThreshold } : {}),
        ...(payload.dhashDuplicateThreshold !== undefined ? { dhashDuplicateThreshold: payload.dhashDuplicateThreshold } : {}),
        ...(payload.featuredAuctionHours !== undefined ? { featuredAuctionHours: payload.featuredAuctionHours } : {}),
        ...(payload.featuredAuctionIntervalDays !== undefined ? { featuredAuctionIntervalDays: payload.featuredAuctionIntervalDays } : {}),
        ...(payload.featuredAuctionsPerSlot !== undefined ? { featuredAuctionsPerSlot: payload.featuredAuctionsPerSlot } : {}),
        ...(payload.cmartHalfPriceEnabled !== undefined ? { cmartHalfPriceEnabled: payload.cmartHalfPriceEnabled } : {}),
        ...(payload.timeBasedPurchaseLimits !== undefined ? { timeBasedPurchaseLimits: payload.timeBasedPurchaseLimits } : {}),
        ...(payload.packPriceDecayAmount      !== undefined ? { packPriceDecayAmount:      payload.packPriceDecayAmount }      : {}),
        ...(payload.packPriceDecayDays        !== undefined ? { packPriceDecayDays:        payload.packPriceDecayDays }        : {}),
        ...(payload.packPriceFloor            !== undefined ? { packPriceFloor:            payload.packPriceFloor }            : {}),
        ...(payload.packMaxDefaultBuysPerUser !== undefined ? { packMaxDefaultBuysPerUser: payload.packMaxDefaultBuysPerUser } : {})
      }
    })
    clearUpgradesConfigCache()
    // Log field-level changes
    const fields = [
      'dailyPointLimit',
      'dailyLoginPoints',
      'dailyNewUserPoints',
      'czoneVisitPoints',
      'czoneVisitMaxPerDay',
      'czoneCount',
      'phashDuplicateThreshold',
      'dhashDuplicateThreshold',
      'featuredAuctionHours',
      'featuredAuctionIntervalDays',
      'featuredAuctionsPerSlot',
      'cmartHalfPriceEnabled',
      'packPriceDecayAmount',
      'packPriceDecayDays',
      'packPriceFloor',
      'packMaxDefaultBuysPerUser'
    ]
    for (const k of fields) {
      const prevVal = before ? before[k] : undefined
      const nextVal = result ? result[k] : undefined
      if (prevVal !== nextVal) {
        await logAdminChange(db, {
          userId: me.id,
          area: 'GlobalGameConfig',
          key: k,
          prevValue: prevVal,
          newValue: nextVal
        })
      }
    }
    // JSON field: compare by serialized value
    if (JSON.stringify(before?.timeBasedPurchaseLimits ?? null) !== JSON.stringify(result?.timeBasedPurchaseLimits ?? null)) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GlobalGameConfig',
        key: 'timeBasedPurchaseLimits',
        prevValue: before?.timeBasedPurchaseLimits ?? null,
        newValue: result?.timeBasedPurchaseLimits ?? null
      })
    }
    return result
  } catch (err) {
    console.error('Error upserting GlobalGameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save global settings' })
  }
})

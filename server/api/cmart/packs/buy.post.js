// server/api/cmart/packs/buy.post.js
// Player buys a sealed Pack with points.
//
// Body: { packId: "uuid" }
//
// Rules
// -----
// • user must be logged-in
// • pack must exist + be inCmart = true
// • user must have ≥ pack.price points
// • if pack.dailyPurchaseLimit is set, user must not have hit the limit
//   for the current 8pm–7:59pm CST daily window
// • deduct points, create a UserPack row (sealed)

import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

import { prisma as db } from '@/server/prisma'
import { checkPackDepletion } from '@/server/utils/packAvailability'
import { getPackDailyWindowStart, resolveEffectiveWindowStart } from '@/server/utils/packDailyWindow'

export default defineEventHandler(async (event) => {
  /* 1.  authenticate user ------------------------------------------------ */
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  /* 2.  parse body ------------------------------------------------------- */
  const { packId } = await readBody(event)
  if (!packId) {
    throw createError({ statusCode: 400, statusMessage: 'packId required' })
  }

  /* 3.  lookup pack & user points --------------------------------------- */
  const [pack, userPts, activeLocks, globalCfg] = await Promise.all([
    db.pack.findUnique({
      where:  { id: packId },
      select: { id: true, price: true, inCmart: true, dailyPurchaseLimit: true, maxBuysPerUser: true, sentAt: true }
    }),
    db.userPoints.findUnique({ where: { userId: me.id }, select: { points: true } }),
    db.lockedPoints.findMany({
      where:  { userId: me.id, status: 'ACTIVE' },
      select: { amount: true }
    }),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        cmartHalfPriceEnabled: true,
        packPriceDecayAmount: true,
        packPriceDecayDays: true,
        packPriceFloor: true
      }
    })
  ])
  if (!pack || !pack.inCmart) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }

  // Apply price decay based on how long the pack has been listed
  const decayAmount = globalCfg?.packPriceDecayAmount ?? 100
  const decayDays   = globalCfg?.packPriceDecayDays   ?? 7
  const priceFloor  = globalCfg?.packPriceFloor        ?? 700
  let decayedPrice = pack.price
  if (pack.sentAt && decayAmount > 0 && decayDays > 0) {
    const msPerDay = 24 * 60 * 60 * 1000
    const daysSinceListed = Math.floor((Date.now() - new Date(pack.sentAt).getTime()) / msPerDay)
    const periods = Math.floor(daysSinceListed / decayDays)
    decayedPrice = Math.max(pack.price - periods * decayAmount, priceFloor)
  }

  const effectivePackPrice = globalCfg?.cmartHalfPriceEnabled === true
    ? Math.floor(decayedPrice / 2)
    : decayedPrice
  const totalPoints    = userPts?.points || 0
  const lockedSum      = activeLocks.reduce((acc, lock) => acc + (lock.amount || 0), 0)
  const availablePoints = totalPoints - lockedSum
  if (availablePoints < effectivePackPrice) {
    throw createError({ statusCode: 400, statusMessage: 'Not enough available points' })
  }

  /* 4.  pack rarity depletion check -------------------------------------- */
  // Some cToons in a pack can also be bought directly via the cToons
  // section. When that happens, a rarity can become unsatisfiable without
  // anyone opening the pack — so the pack's inCmart flag may still be true
  // even though the pack is effectively sold out. Re-check depletion here
  // and unlist the pack if it can no longer be filled.
  const depletion = await checkPackDepletion(pack.id)
  if (depletion.shouldUnlist) {
    await db.pack.update({ where: { id: pack.id }, data: { inCmart: false } }).catch(() => {})
    throw createError({
      statusCode: 410,
      statusMessage: 'This pack is sold out.'
    })
  }

  /* 5a. total purchase limit check -------------------------------------- */
  if (pack.maxBuysPerUser != null) {
    const totalPurchased = await db.userPack.count({
      where: { userId: me.id, packId: pack.id }
    })
    if (totalPurchased >= pack.maxBuysPerUser) {
      throw createError({
        statusCode: 429,
        statusMessage: `Purchase limit reached — you can only buy this pack ${pack.maxBuysPerUser} time${pack.maxBuysPerUser === 1 ? '' : 's'}`
      })
    }
  }

  /* 5b. daily purchase limit check -------------------------------------- */
  if (pack.dailyPurchaseLimit != null) {
    const windowStart = getPackDailyWindowStart()
    // An admin "Reset Pack Limit" moves the effective window start forward
    // to the reset time, so purchases made earlier today stop counting.
    const limitReset = await db.userPackLimitReset.findUnique({
      where: { userId_packId: { userId: me.id, packId: pack.id } },
      select: { resetAt: true }
    })
    const effectiveWindowStart = resolveEffectiveWindowStart(windowStart, limitReset?.resetAt)
    const purchasedToday = await db.userPack.count({
      where: {
        userId:    me.id,
        packId:    pack.id,
        createdAt: { gte: effectiveWindowStart }
      }
    })
    if (purchasedToday >= pack.dailyPurchaseLimit) {
      throw createError({
        statusCode: 429,
        statusMessage: `Daily limit reached — you can buy ${pack.dailyPurchaseLimit} of this pack per day (resets at 8pm CST)`
      })
    }
  }

  /* 6.  transaction: deduct points + create sealed pack ----------------- */
  const result = await db.$transaction(async (tx) => {
    // 6-a  deduct points
    const updated = await tx.userPoints.update({
      where: { userId: me.id },
      data:  { points: { decrement: effectivePackPrice } }
    })

    await tx.pointsLog.create({
      data: { userId: me.id, points: effectivePackPrice, total: updated.points, method: "Bought Pack", direction: 'decrease' }
    })

    // 6-b  create UserPack (sealed) — record effective price paid at this moment
    const userPack = await tx.userPack.create({
      data: {
        userId: me.id,
        packId: pack.id,
        opened: false,
        pricePaid: effectivePackPrice
      }
    })

    return userPack
  })

  /* 7.  success response ------------------------------------------------- */
  return { success: true, userPackId: result.id }
})

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
// • if pack.dailyPurchaseLimit / maxBuysPerUser is set, the user must not have hit it (counted by
//   ORIGINAL buyer, for the current 8pm–7:59pm CST daily window; enforced inside the transaction)
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
import { logPackOwners } from '@/server/utils/userPackState'

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
      select: { id: true, price: true, inCmart: true, dailyPurchaseLimit: true, maxBuysPerUser: true, sentAt: true, priceDecays: true }
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
  if (pack.priceDecays !== false && pack.sentAt && decayAmount > 0 && decayDays > 0) {
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

  /* 6.  transaction: enforce purchase limits, deduct points, create sealed pack ------------------- */
  // The limit checks live INSIDE the transaction, behind a per-(user, pack) advisory lock. They used to run before it
  // with nothing serialising them, so N parallel buy requests all counted the same N-1 purchases and all passed —
  // which, now that packs can be traded and auctioned, is directly monetisable.
  //
  // Limits count PURCHASES by the ORIGINAL BUYER (UserPack.buyerId), never packs the user currently holds: a pack won
  // from a code or a PvP match, or received in a trade, does not use up a buy slot, and trading a pack away does not
  // free one. buyerId is set only for source = PURCHASE (see the owned-packs migration).
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`packbuy:${me.id}:${pack.id}`}))`

    // 5a. total purchase limit
    if (pack.maxBuysPerUser != null) {
      const totalPurchased = await tx.userPack.count({ where: { buyerId: me.id, packId: pack.id } })
      if (totalPurchased >= pack.maxBuysPerUser) {
        throw createError({
          statusCode: 429,
          statusMessage: `Purchase limit reached — you can only buy this pack ${pack.maxBuysPerUser} time${pack.maxBuysPerUser === 1 ? '' : 's'}`
        })
      }
    }

    // 5b. daily purchase limit
    if (pack.dailyPurchaseLimit != null) {
      const windowStart = getPackDailyWindowStart()
      // An admin "Reset Pack Limit" moves the effective window start forward to the reset time, so purchases made
      // earlier today stop counting.
      const limitReset = await tx.userPackLimitReset.findUnique({
        where: { userId_packId: { userId: me.id, packId: pack.id } },
        select: { resetAt: true }
      })
      const effectiveWindowStart = resolveEffectiveWindowStart(windowStart, limitReset?.resetAt)
      const purchasedToday = await tx.userPack.count({
        where: { buyerId: me.id, packId: pack.id, createdAt: { gte: effectiveWindowStart } }
      })
      if (purchasedToday >= pack.dailyPurchaseLimit) {
        throw createError({
          statusCode: 429,
          statusMessage: `Daily limit reached — you can buy ${pack.dailyPurchaseLimit} of this pack per day (resets at 8pm CST)`
        })
      }
    }

    // 6-0  re-check affordability UNDER a row lock. The pre-check above runs outside any transaction and the advisory lock
    // above only serialises one (user, pack) pair, so N parallel buys of different packs (or of one with no limit) all
    // passed it and all committed — spending the same points N times, with N directly-tradable packs to show for it.
    await tx.$queryRaw`SELECT "points" FROM "UserPoints" WHERE "userId" = ${me.id} FOR UPDATE`
    const [{ points: nowPoints } = { points: 0 }] = await tx.$queryRaw`SELECT "points" FROM "UserPoints" WHERE "userId" = ${me.id}`
    const lockedNow = await tx.lockedPoints.aggregate({
      where: { userId: me.id, status: 'ACTIVE' },
      _sum: { amount: true }
    })
    if ((nowPoints || 0) - (lockedNow._sum.amount || 0) < effectivePackPrice) {
      throw createError({ statusCode: 400, statusMessage: 'Not enough available points' })
    }

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
        pricePaid: effectivePackPrice,
        source: 'PURCHASE',
        buyerId: me.id
      }
    })
    await logPackOwners(tx, [{ userPackId: userPack.id, packId: pack.id, userId: me.id, method: 'PURCHASE' }])

    return userPack
  })

  /* 7.  success response ------------------------------------------------- */
  return { success: true, userPackId: result.id }
})

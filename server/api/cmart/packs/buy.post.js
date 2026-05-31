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

/**
 * Returns the start of the current 8pm–7:59pm CST daily window as a UTC Date.
 * If it's before 8pm Chicago time, the window started yesterday at 8pm.
 */
function getDailyWindowStart() {
  const now = new Date()

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )

  let year = +parts.year, month = +parts.month - 1, day = +parts.day
  const hour = +parts.hour

  if (hour < 20) {
    // Before 8pm Chicago — window started yesterday at 8pm
    const d = new Date(Date.UTC(year, month, day))
    d.setUTCDate(d.getUTCDate() - 1)
    year  = d.getUTCFullYear()
    month = d.getUTCMonth()
    day   = d.getUTCDate()
  }

  // Convert "YYYY-MM-DD 20:00 Chicago" → UTC using the same offset-correction
  // trick used elsewhere in this codebase.
  const utcGuessMs = Date.UTC(year, month, day, 20, 0, 0)
  const fmtCheck = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const displayed = Object.fromEntries(
    fmtCheck.formatToParts(new Date(utcGuessMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(
    +displayed.year, +displayed.month - 1, +displayed.day,
    +displayed.hour, +displayed.minute, +displayed.second
  )
  const offsetMs = zonalMs - utcGuessMs
  return new Date(utcGuessMs - offsetMs)
}


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
      select: { id: true, price: true, inCmart: true, dailyPurchaseLimit: true }
    }),
    db.userPoints.findUnique({ where: { userId: me.id }, select: { points: true } }),
    db.lockedPoints.findMany({
      where:  { userId: me.id, status: 'ACTIVE' },
      select: { amount: true }
    }),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cmartHalfPriceEnabled: true } })
  ])
  if (!pack || !pack.inCmart) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }
  const effectivePackPrice = globalCfg?.cmartHalfPriceEnabled === true
    ? Math.floor(pack.price / 2)
    : pack.price
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

  /* 5.  daily purchase limit check --------------------------------------- */
  if (pack.dailyPurchaseLimit != null) {
    const windowStart = getDailyWindowStart()
    const purchasedToday = await db.userPack.count({
      where: {
        userId:    me.id,
        packId:    pack.id,
        createdAt: { gte: windowStart }
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

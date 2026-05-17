// server/api/lottery.post.js
import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'
import { prisma as db } from '@/server/prisma'
import { createHash } from 'crypto'

export default defineEventHandler(async (event) => {
  // require auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // ensure LottoSettings exists
  const settings = await db.lottoSettings.findUnique({
    where: { id: 'lotto' },
    include: {
      ctoonPool: {
        include: { ctoon: true }
      }
    }
  })
  if (!settings) {
    throw createError({ statusCode: 500, statusMessage: 'Lotto settings not found. Please seed the database.' })
  }

  // fetch or create user's lotto state
  let u = await db.lottoUser.findUnique({ where: { userId: me.id } })
  const now = new Date()
  // Compute Chicago 8:00 AM window start (matches Winwheel logic)
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = now.getTime() - chicagoNow.getTime()
  const y = chicagoNow.getFullYear(), m = chicagoNow.getMonth(), d = chicagoNow.getDate()
  let resetUtcMs = new Date(y, m, d, 8, 0, 0).getTime() + offsetMs
  if (now.getTime() < resetUtcMs) resetUtcMs -= 24 * 60 * 60 * 1000
  const windowStart = new Date(resetUtcMs)

  if (!u) {
    u = await db.lottoUser.create({ data: { userId: me.id, odds: Math.max(0, settings.baseOdds), lastReset: now } })
  } else {
    // reset daily purchases if lastReset is before current Chicago window start
    if (!u.lastReset || new Date(u.lastReset).getTime() < windowStart.getTime()) {
      u = await db.lottoUser.update({ where: { userId: me.id }, data: { purchasesToday: 0, lastReset: now } })
    }
    // ensure odds at least baseOdds
    if (u.odds == null || u.odds < settings.baseOdds) {
      u = await db.lottoUser.update({ where: { userId: me.id }, data: { odds: settings.baseOdds } })
    }
  }

  // Atomically enforce the daily limit, increment purchasesToday, and deduct the
  // ticket cost in a single transaction. Prizes are only awarded after this
  // succeeds, so a limit violation or insufficient-points error always rolls back
  // before any reward is committed.
  let purchasesTodayAfter
  const pointsAfterPurchase = await db.$transaction(async (tx) => {
    const current = await tx.lottoUser.findUnique({ where: { userId: me.id } })
    if (settings.countPerDay !== -1 && (current?.purchasesToday ?? 0) >= settings.countPerDay) {
      throw createError({ statusCode: 400, statusMessage: 'Daily ticket limit reached' })
    }
    const next = await tx.lottoUser.update({
      where: { userId: me.id },
      data: { purchasesToday: { increment: 1 }, lastPurchaseAt: now }
    })
    purchasesTodayAfter = next.purchasesToday

    const deducted = await tx.userPoints.updateMany({
      where: { userId: me.id, points: { gte: settings.cost } },
      data: { points: { decrement: settings.cost }, updatedAt: new Date() }
    })
    if (deducted.count === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Not enough points to buy a ticket' })
    }
    const after = await tx.userPoints.findUnique({ where: { userId: me.id } })
    await tx.pointsLog.create({ data: { userId: me.id, direction: 'decrease', points: settings.cost, total: after.points, method: 'lottery-ticket' } })
    return after.points
  })

  const oddsBefore = u.odds ?? settings.baseOdds
  let oddsAfter = oddsBefore

  // roll between 0 and 100, two decimals
  const raw = Math.random() * 100
  const roll = Number(raw.toFixed(2))

  const ctoonWin = roll <= u.odds
  const pointsWin = !ctoonWin && roll <= (u.odds * 2)

  let awardedPoints = 0
  let awardedCtoon = null
  let emptyPoolWin = false
  let verificationCode = null
  let verificationHash = null

  let wonUserCtoonId = null

  if (ctoonWin) {
    // Grand Prize: Win a cToon from the pool
    const availablePool = settings.ctoonPool.filter(p => p.ctoon.quantity === null || p.ctoon.totalMinted < p.ctoon.quantity)
    if (availablePool.length > 0) {
      await db.$transaction(async (tx) => {
        const randomIndex = Math.floor(Math.random() * availablePool.length)
        const prizeCtoonInfo = availablePool[randomIndex]
        awardedCtoon = prizeCtoonInfo.ctoon

        // Increment first; the returned totalMinted is this mint's number
        const updatedCtoon = await tx.ctoon.update({
          where: { id: awardedCtoon.id },
          data: { totalMinted: { increment: 1 } },
          select: { totalMinted: true, initialQuantity: true }
        })
        const mintNumber = updatedCtoon.totalMinted
        const isFirstEdition = updatedCtoon.initialQuantity === null || mintNumber <= updatedCtoon.initialQuantity

        // Mint the new ctoon for the user
        const newUserCtoon = await tx.userCtoon.create({
          data: {
            userId: me.id,
            ctoonId: awardedCtoon.id,
            isTradeable: true,
            mintNumber,
            isFirstEdition
          }
        })
        wonUserCtoonId = newUserCtoon.id

        // Record ownership log
        await tx.ctoonOwnerLog.create({
          data: {
            userId: me.id,
            ctoonId: awardedCtoon.id,
            userCtoonId: newUserCtoon.id,
            mintNumber
          }
        })
      })
    } else {
      // Fallback to points if pool is empty
      // Pool is empty. Generate a verification code for the user to report.
      emptyPoolWin = true
      awardedPoints = 0
      verificationCode = Math.floor(Math.random() * (99 - 10 + 1)) + 10 // Random int between 10 and 99
      const stringToHash = `${verificationCode}${me.username}`
      verificationHash = createHash('sha256').update(stringToHash).digest('hex')
    }
    // Reset odds back to baseOdds after a grand prize win
    oddsAfter = settings.baseOdds
    await db.lottoUser.update({ where: { userId: me.id }, data: { odds: settings.baseOdds } })
  } else {
    // Not a cToon win, so odds should increase.
    // This block covers both a points win and a loss.
    const newOdds = Number((u.odds + settings.incrementRate).toFixed(6))
    oddsAfter = newOdds
    await db.lottoUser.update({ where: { userId: me.id }, data: { odds: newOdds } })

    if (pointsWin) {
      // Secondary Prize: Win points — use increment (not SET) to avoid overwriting
      // concurrent point changes with a stale computed total.
      awardedPoints = settings.lottoPointsWinnings
      await db.$transaction(async (tx) => {
        const updated = await tx.userPoints.update({
          where: { userId: me.id },
          data: { points: { increment: awardedPoints }, updatedAt: new Date() }
        })
        await tx.pointsLog.create({ data: { userId: me.id, direction: 'increase', points: awardedPoints, total: updated.points, method: 'lottery-win' } })
      })
    }
  }

  const outcome = ctoonWin ? 'CTOON' : pointsWin ? 'POINTS' : 'NOTHING'

  await db.lottoLog.create({
    data: {
      userId: me.id,
      outcome,
      oddsBefore,
      oddsAfter,
      ...(wonUserCtoonId ? { userCtoonId: wonUserCtoonId } : {})
    }
  })

  const remaining = (settings.countPerDay === -1) ? -1 : Math.max(0, settings.countPerDay - purchasesTodayAfter)

  return {
    roll,
    win: ctoonWin || pointsWin,
    newOdds: oddsAfter,
    remaining,
    awardedPoints,
    awardedCtoon,
    emptyPoolWin,
    verificationCode,
    verificationHash
  }
})

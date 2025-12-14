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

  // buy one ticket per request
  // check daily limit
  if (settings.countPerDay !== -1 && u.purchasesToday >= settings.countPerDay) {
    throw createError({ statusCode: 400, statusMessage: 'Daily ticket limit reached' })
  }

  // check points balance
  const userPoints = await db.userPoints.findUnique({ where: { userId: me.id } })
  const currentPoints = userPoints?.points ?? 0
  if (currentPoints < settings.cost) {
    throw createError({ statusCode: 400, statusMessage: 'Not enough points to buy a ticket' })
  }

  // Subtract cost of ticket
  const pointsAfterPurchase = currentPoints - settings.cost
  await db.$transaction([
    db.userPoints.update({
      where: { userId: me.id },
      data: {
        points: pointsAfterPurchase,
        updatedAt: new Date()
      }
    }),
    db.pointsLog.create({ data: { userId: me.id, direction: 'decrease', points: settings.cost, total: pointsAfterPurchase, method: 'lottery-ticket' } })
  ])

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

  if (ctoonWin) {
    // Grand Prize: Win a cToon from the pool
    const availablePool = settings.ctoonPool.filter(p => p.ctoon.quantity === null || p.ctoon.totalMinted < p.ctoon.quantity)
    if (availablePool.length > 0) {
      await db.$transaction(async (tx) => {
        const randomIndex = Math.floor(Math.random() * availablePool.length)
        const prizeCtoonInfo = availablePool[randomIndex]
        awardedCtoon = prizeCtoonInfo.ctoon

        // Mint the new ctoon for the user
        await tx.userCtoon.create({
          data: {
            userId: me.id,
            ctoonId: awardedCtoon.id,
            isTradeable: true,
            mintNumber: awardedCtoon.totalMinted + 1
          }
        })
        // Increment the total minted count for the ctoon
        await tx.ctoon.update({ where: { id: awardedCtoon.id }, data: { totalMinted: { increment: 1 } } })
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
    await db.lottoUser.update({ where: { userId: me.id }, data: { odds: settings.baseOdds } })
  } else {
    // Not a cToon win, so odds should increase.
    // This block covers both a points win and a loss.
    const newOdds = Number((u.odds + settings.incrementRate).toFixed(6))
    await db.lottoUser.update({ where: { userId: me.id }, data: { odds: newOdds } })

    if (pointsWin) {
      // Secondary Prize: Win points
      awardedPoints = settings.lottoPointsWinnings
      await db.$transaction(async (tx) => {
        const newTotal = pointsAfterPurchase + awardedPoints
        await tx.userPoints.update({ where: { userId: me.id }, data: { points: newTotal, updatedAt: new Date() } })
        await tx.pointsLog.create({ data: { userId: me.id, direction: 'increase', points: awardedPoints, total: newTotal, method: 'lottery-win' } })
      })
    }
  }

  // increment purchasesToday and lastPurchaseAt
  const updated = await db.lottoUser.update({ where: { userId: me.id }, data: { purchasesToday: { increment: 1 }, lastPurchaseAt: now } })

  const remaining = (settings.countPerDay === -1) ? -1 : Math.max(0, settings.countPerDay - updated.purchasesToday)

  return {
    roll,
    win: ctoonWin || pointsWin,
    newOdds: updated.odds,
    remaining,
    awardedPoints,
    awardedCtoon,
    emptyPoolWin,
    verificationCode,
    verificationHash
  }
})
// server/api/lottery.js
import { defineEventHandler, getRequestHeader, createError, readBody, getMethod } from 'h3'
import { prisma as db } from '@/server/prisma'

function isSameUtcDay(a, b) {
  if (!a || !b) return false
  const da = new Date(a)
  const dbd = new Date(b)
  return da.getUTCFullYear() === dbd.getUTCFullYear() && da.getUTCMonth() === dbd.getUTCMonth() && da.getUTCDate() === dbd.getUTCDate()
}

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

  const method = getMethod(event)

  // ensure LottoSettings exists
  let settings = await db.lottoSettings.findUnique({ where: { id: 'lotto' } })
  if (!settings) {
    settings = await db.lottoSettings.create({ data: { id: 'lotto', baseOdds: 1.0, incrementRate: 0.02, countPerDay: 5, cost: 50 } })
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

  if (method === 'GET') {
    const remaining = (settings.countPerDay === -1) ? -1 : Math.max(0, settings.countPerDay - u.purchasesToday)
    return { odds: u.odds, remaining, cost: settings.cost }
  }

  if (method === 'POST') {
    const body = await readBody(event)
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
    const win = roll <= u.odds

    let awardedPoints = 0
    if (win) {
      // Award big points (configurable later). Use 5000 points for now.
      awardedPoints = 5000
      // upsert user's points and log
      await db.$transaction(async (tx) => {
        // The user's points record is guaranteed to exist from the subtraction step
        const newTotal = pointsAfterPurchase + awardedPoints
        await tx.userPoints.update({ where: { userId: me.id }, data: { points: newTotal, updatedAt: new Date() } })
        await tx.pointsLog.create({ data: { userId: me.id, direction: 'increase', points: awardedPoints, total: newTotal, method: 'lottery-win' } })
      })
      // reset odds back to baseOdds after win
      await db.lottoUser.update({ where: { userId: me.id }, data: { odds: settings.baseOdds } })
    } else {
      // lose: increment odds by incrementRate
      const newOdds = Number((u.odds + settings.incrementRate).toFixed(6))
      await db.lottoUser.update({ where: { userId: me.id }, data: { odds: newOdds } })
    }

    // increment purchasesToday and lastPurchaseAt
    const updated = await db.lottoUser.update({ where: { userId: me.id }, data: { purchasesToday: { increment: 1 }, lastPurchaseAt: now } })

    const remaining = (settings.countPerDay === -1) ? -1 : Math.max(0, settings.countPerDay - updated.purchasesToday)

    return {
      roll,
      win,
      newOdds: updated.odds,
      remaining,
      awardedPoints
    }
  }

  throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
})

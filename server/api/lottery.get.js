// server/api/lottery.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

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

  const remaining = (settings.countPerDay === -1) ? -1 : Math.max(0, settings.countPerDay - u.purchasesToday)

  const availablePrizes = settings.ctoonPool
    .map(p => p.ctoon)
    .filter(c => c.quantity === null || c.totalMinted < c.quantity)

  return {
    odds: u.odds,
    remaining, cost: settings.cost, prizePool: availablePrizes
  }
})
// server/api/admin/activity-unique.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { addDays, addWeeks, subMonths, subYears, format, startOfWeek } from 'date-fns'
import { prisma } from '@/server/prisma'

function getStartDate(timeframe) {
  const now = new Date()
  switch (timeframe) {
    case '1m': return subMonths(now, 1)
    case '3m': return subMonths(now, 3)
    case '6m': return subMonths(now, 6)
    case '1y': return subYears(now, 1)
    default:   return subMonths(now, 3)
  }
}

const WEEK_STARTS_ON = 1 // Monday

export default defineEventHandler(async (event) => {
  // Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // Params
  const query = getQuery(event)
  const timeframe = query.timeframe || '3m'
  const groupBy = query.groupBy === 'weekly' ? 'weekly' : 'daily'

  const startDate = getStartDate(timeframe)
  const today = new Date()
  const endDate = new Date(format(today, 'yyyy-MM-dd')) // strip time

  // Fetch activity from multiple sources
  const [
    loginLogs,
    gamePointLogs,
    pointsLogs,
    visits,
    userPacks,
    bids,
    wheelSpins,
    claims,
    ownerLogs,
    clashGames,
    auctionsCreated,
    auctionOnlyCreated,
    friends,
    wishlistItems,
    tradeOffersCreated,
    autoBids,
    backgroundsCreated,
    adImagesCreated,
  ] = await Promise.all([
    prisma.loginLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.gamePointLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.pointsLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.visit.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.userPack.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.bid.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.wheelSpinLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.claim.findMany({
      where: { claimedAt: { gte: startDate } },
      select: { userId: true, claimedAt: true },
      orderBy: { claimedAt: 'asc' }
    }),
    prisma.ctoonOwnerLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.clashGame.findMany({
      where: { startedAt: { gte: startDate } },
      select: { player1UserId: true, player2UserId: true, startedAt: true },
      orderBy: { startedAt: 'asc' }
    }),
    prisma.auction.findMany({
      where: { createdAt: { gte: startDate } },
      select: { creatorId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.auctionOnly.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdById: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.friend.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.wishlistItem.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.tradeOffer.findMany({
      where: { createdAt: { gte: startDate } },
      select: { initiatorId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.auctionAutoBid.findMany({
      where: { createdAt: { gte: startDate } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.background.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdById: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.adImage.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdById: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }),
  ])

  // Normalize to { userId, createdAt }
  const entries = []

  ;[
    loginLogs, gamePointLogs, pointsLogs, visits, userPacks,
    bids, wheelSpins, ownerLogs, friends, wishlistItems, autoBids
  ].forEach(list => {
    for (const r of list) {
      if (r.userId) entries.push({ userId: r.userId, createdAt: r.createdAt })
    }
  })

  for (const r of claims) {
    if (r.userId) entries.push({ userId: r.userId, createdAt: r.claimedAt })
  }

  for (const g of clashGames) {
    if (g.player1UserId) entries.push({ userId: g.player1UserId, createdAt: g.startedAt })
    if (g.player2UserId) entries.push({ userId: g.player2UserId, createdAt: g.startedAt })
  }

  for (const a of auctionsCreated) {
    if (a.creatorId) entries.push({ userId: a.creatorId, createdAt: a.createdAt })
  }

  for (const a of auctionOnlyCreated) {
    if (a.createdById) entries.push({ userId: a.createdById, createdAt: a.createdAt })
  }

  for (const b of backgroundsCreated) {
    if (b.createdById) entries.push({ userId: b.createdById, createdAt: b.createdAt })
  }

  for (const a of adImagesCreated) {
    if (a.createdById) entries.push({ userId: a.createdById, createdAt: a.createdAt })
  }

  for (const t of tradeOffersCreated) {
    if (t.initiatorId) entries.push({ userId: t.initiatorId, createdAt: t.createdAt })
  }

  // Empty window handling
  if (entries.length === 0) {
    if (groupBy === 'weekly') {
      const result = []
      let w = startOfWeek(new Date(format(startDate, 'yyyy-MM-dd')), { weekStartsOn: WEEK_STARTS_ON })
      const endWeek = startOfWeek(endDate, { weekStartsOn: WEEK_STARTS_ON })
      while (w <= endWeek) {
        result.push({ period: format(w, 'yyyy-MM-dd'), count: 0 })
        w = addWeeks(w, 1)
      }
      return result
    } else {
      const result = []
      let d = new Date(format(startDate, 'yyyy-MM-dd'))
      while (d <= endDate) {
        result.push({ day: format(d, 'yyyy-MM-dd'), count: 0 })
        d = addDays(d, 1)
      }
      return result
    }
  }

  // Grouping
  if (groupBy === 'weekly') {
    const weekMap = new Map() // weekStart -> Set<userId>
    for (const e of entries) {
      const wkStart = startOfWeek(e.createdAt, { weekStartsOn: WEEK_STARTS_ON })
      const key = format(wkStart, 'yyyy-MM-dd')
      if (!weekMap.has(key)) weekMap.set(key, new Set())
      weekMap.get(key).add(e.userId)
    }

    const result = []
    const startWeek = startOfWeek(new Date(format(startDate, 'yyyy-MM-dd')), { weekStartsOn: WEEK_STARTS_ON })
    const endWeek = startOfWeek(endDate, { weekStartsOn: WEEK_STARTS_ON })
    let w = startWeek
    while (w <= endWeek) {
      const key = format(w, 'yyyy-MM-dd')
      result.push({ period: key, count: weekMap.get(key)?.size ?? 0 })
      w = addWeeks(w, 1)
    }
    return result
  } else {
    const dayMap = new Map() // yyyy-MM-dd -> Set<userId>
    for (const e of entries) {
      const day = format(e.createdAt, 'yyyy-MM-dd')
      if (!dayMap.has(day)) dayMap.set(day, new Set())
      dayMap.get(day).add(e.userId)
    }

    const result = []
    let d = new Date(format(startDate, 'yyyy-MM-dd'))
    while (d <= endDate) {
      const dayStr = format(d, 'yyyy-MM-dd')
      result.push({ day: dayStr, count: dayMap.get(dayStr)?.size ?? 0 })
      d = addDays(d, 1)
    }
    return result
  }
})

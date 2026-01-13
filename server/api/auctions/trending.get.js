// server/api/auctions/trending.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  // 1) Auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const hasBidsOnly = ['1', 'true', 'yes'].includes(String(query.hasBids || '').toLowerCase())

  // 2) Active auctions (ids only for ranking)
  const active = await prisma.auction.findMany({
    where: {
      status: 'ACTIVE',
      ...(hasBidsOnly ? { bids: { some: {} } } : {})
    },
    select: { id: true, endAt: true }
  })
  if (!active.length) return []

  // 3) Count bids in the last 24h
  const since = new Date(Date.now() - ONE_DAY_MS)
  const recentCounts = await prisma.bid.groupBy({
    by: ['auctionId'],
    where: {
      auctionId: { in: active.map(a => a.id) },
      createdAt: { gte: since }
    },
    _count: { _all: true }
  })
  const recentCountMap = new Map(
    recentCounts.map(r => [r.auctionId, r._count._all ?? 0])
  )

  // 4) Top 3 by recent bid count (tie-breaker: ending soonest)
  const orderedIds = active
    .slice()
    .sort((a, b) => {
      const aCount = recentCountMap.get(a.id) || 0
      const bCount = recentCountMap.get(b.id) || 0
      if (bCount !== aCount) return bCount - aCount
      return new Date(a.endAt) - new Date(b.endAt)
    })
    .slice(0, 3)
    .map(a => a.id)

  if (!orderedIds.length) return []

  // 5) Load full auction data for display
  const auctions = await prisma.auction.findMany({
    where: { id: { in: orderedIds } },
    include: {
      userCtoon: {
        select: {
          id: true,
          ctoonId: true,
          mintNumber: true,
          ctoon: { select: { name: true, series: true, rarity: true, assetPath: true, characters: true } }
        }
      },
      bids: { select: { amount: true }, orderBy: { amount: 'desc' }, take: 1 },
      _count: { select: { bids: true } }
    }
  })

  const ctoonIds = auctions.map(a => a.userCtoon.ctoonId)
  const [owned, holidayItems] = await Promise.all([
    prisma.userCtoon.findMany({
      where: { userId, ctoonId: { in: ctoonIds } },
      select: { ctoonId: true }
    }),
    prisma.holidayEventItem.findMany({
      where: { ctoonId: { in: ctoonIds } },
      select: { ctoonId: true }
    })
  ])

  const ownedSet = new Set(owned.map(u => u.ctoonId))
  const holidaySet = new Set(holidayItems.map(h => h.ctoonId))
  const auctionMap = new Map(auctions.map(a => [a.id, a]))

  return orderedIds
    .map(id => {
      const a = auctionMap.get(id)
      if (!a) return null
      return {
        id:           a.id,
        isFeatured:   a.isFeatured,
        userCtoonId:  a.userCtoon.id,
        ctoonId:      a.userCtoon.ctoonId,
        name:         a.userCtoon.ctoon.name,
        series:       a.userCtoon.ctoon.series,
        rarity:       a.userCtoon.ctoon.rarity,
        characters:   a.userCtoon.ctoon.characters || [],
        mintNumber:   a.userCtoon.mintNumber,
        assetPath:    a.userCtoon.ctoon.assetPath,
        endAt:        a.endAt.toISOString(),
        highestBid:   a.bids.length > 0 ? a.bids[0].amount : a.initialBet,
        bidCount:     a._count?.bids ?? 0,
        isOwned:      ownedSet.has(a.userCtoon.ctoonId),
        isHolidayItem: holidaySet.has(a.userCtoon.ctoonId)
      }
    })
    .filter(Boolean)
})

// server/api/auctions.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'

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

  // 2) Active auctions with minimal nested data
  const where = { status: 'ACTIVE' }
  if (hasBidsOnly) where.bids = { some: {} }

  const auctions = await prisma.auction.findMany({
    where,
    include: {
      userCtoon: {
        select: {
          id: true,
          userId: true,
          ctoonId: true,
          mintNumber: true,
          ctoon: { select: { name: true, series: true, set: true, rarity: true, isGtoon: true, cost: true, power: true, assetPath: true, characters: true, isSecondEdition: true, secondEditionOverlayX: true, secondEditionOverlayY: true, secondEditionOverlaySize: true } }
        }
      },
      bids: { select: { amount: true }, orderBy: { amount: 'desc' }, take: 1 },
      _count: { select: { bids: true } }
    },
    orderBy: [
      { endAt: 'asc' }
    ]
  })

  if (auctions.length === 0) return []

  // 3) Sets for ownership and holiday membership
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

  // 4) Shape for client
  return auctions.map(a => ({
    id:           a.id,
    isFeatured:   a.isFeatured,
    userCtoonId:  encodeUserCtoonId(a.userCtoon.userId, a.userCtoon.ctoonId, a.userCtoon.mintNumber),
    ctoonId:      a.userCtoon.ctoonId,
    name:         a.userCtoon.ctoon.name,
    set:          a.userCtoon.ctoon.set,
    series:       a.userCtoon.ctoon.series,
    rarity:       a.userCtoon.ctoon.rarity,
    isGtoon:      a.userCtoon.ctoon.isGtoon,
    cost:         a.userCtoon.ctoon.cost,
    power:        a.userCtoon.ctoon.power,
    characters:   a.userCtoon.ctoon.characters || [],
    mintNumber:   a.userCtoon.mintNumber,
    assetPath:    a.userCtoon.ctoon.assetPath,
    endAt:        a.endAt.toISOString(),
    initialBid:   a.initialBet,
    highestBid:   a.bids.length > 0 ? a.bids[0].amount : a.initialBet,
    bidCount:     a._count?.bids ?? 0,
    isOwned:      ownedSet.has(a.userCtoon.ctoonId),
    isHolidayItem: holidaySet.has(a.userCtoon.ctoonId),
    isSecondEdition: a.userCtoon.ctoon.isSecondEdition,
    secondEditionOverlayX: a.userCtoon.ctoon.secondEditionOverlayX,
    secondEditionOverlayY: a.userCtoon.ctoon.secondEditionOverlayY,
    secondEditionOverlaySize: a.userCtoon.ctoon.secondEditionOverlaySize
  }))
})

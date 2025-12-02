// server/api/auctions.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2) Active auctions with minimal nested data
  const auctions = await prisma.auction.findMany({
    where: { status: 'ACTIVE' },
    include: {
      userCtoon: {
        select: {
          ctoonId: true,
          mintNumber: true,
          ctoon: { select: { name: true, series: true, rarity: true, assetPath: true } }
        }
      },
      bids: { select: { amount: true }, orderBy: { amount: 'desc' }, take: 1 }
    },
    orderBy: { endAt: 'asc' }
  })

  if (auctions.length === 0) return []

  // 3) Sets for ownership and holiday membership
  const ctoonIds = auctions.map(a => a.userCtoon.ctoonId)

  const [owned, holidayItems] = await Promise.all([
    prisma.userCtoon.findMany({
      where: { userId, ctoonId: { in: ctoonIds } },
      select: { ctoonId: true }
    }),
    // Treat as Holiday Item if the cToon appears in ANY HolidayEventItem
    prisma.holidayEventItem.findMany({
      where: { ctoonId: { in: ctoonIds } },
      select: { ctoonId: true }
    })
  ])

  const ownedSet = new Set(owned.map(u => u.ctoonId))
  const holidaySet = new Set(holidayItems.map(h => h.ctoonId))

  // 4) Shape for client
  return auctions.map(a => ({
    id:          a.id,
    isFeatured: a.isFeatured,
    name:        a.userCtoon.ctoon.name,
    series:      a.userCtoon.ctoon.series,
    rarity:      a.userCtoon.ctoon.rarity,
    mintNumber:  a.userCtoon.mintNumber,
    assetPath:   a.userCtoon.ctoon.assetPath,
    endAt:       a.endAt.toISOString(),
    highestBid:  a.bids.length > 0 ? a.bids[0].amount : a.initialBet,
    isOwned:     ownedSet.has(a.userCtoon.ctoonId),
    isHolidayItem: holidaySet.has(a.userCtoon.ctoonId)
  }))
})

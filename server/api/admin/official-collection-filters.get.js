// server/api/admin/official-collection-filters.get.js
// Returns distinct filter-option values (sets, series, rarities) for the
// official account's tradeable, non-locked collection.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const isMattShull = me.discordTag?.toLowerCase() === 'mattshull'
  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

  const officialUser = await prisma.user.findUnique({
    where: { username: officialUsername },
    select: { id: true }
  })
  if (!officialUser) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }

  // Get all UserCtoon IDs to identify locked ones
  const allUserCtoonIds = await prisma.userCtoon.findMany({
    where: { userId: officialUser.id, burnedAt: null },
    select: { id: true }
  })
  const allIds = allUserCtoonIds.map(uc => uc.id)

  let lockedIds = []
  if (allIds.length) {
    const [activeAuctionRows, pendingTradeRows, dissolveQueueRows, auctionOnlyRows] = await Promise.all([
      prisma.auction.findMany({ where: { userCtoonId: { in: allIds }, status: 'ACTIVE' }, select: { userCtoonId: true } }),
      prisma.tradeOfferCtoon.findMany({ where: { userCtoonId: { in: allIds }, tradeOffer: { status: 'PENDING' } }, select: { userCtoonId: true } }),
      prisma.dissolveAuctionQueue.findMany({ where: { userCtoonId: { in: allIds } }, select: { userCtoonId: true } }),
      prisma.auctionOnly.findMany({ where: { userCtoonId: { in: allIds }, isStarted: false }, select: { userCtoonId: true } })
    ])
    lockedIds = [
      ...activeAuctionRows.map(r => r.userCtoonId),
      ...pendingTradeRows.map(r => r.userCtoonId),
      ...dissolveQueueRows.map(r => r.userCtoonId),
      ...auctionOnlyRows.map(r => r.userCtoonId)
    ]
  }

  // Fetch only the ctoon fields needed for filter options (minimal data)
  const rows = await prisma.userCtoon.findMany({
    where: {
      userId: officialUser.id,
      burnedAt: null,
      ...(isMattShull ? {} : { isTradeable: true }),
      ...(lockedIds.length ? { id: { notIn: lockedIds } } : {})
    },
    select: { ctoon: { select: { set: true, series: true, rarity: true } } }
  })

  const PRIORITY_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
  const allSets     = [...new Set(rows.map(r => r.ctoon.set?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const allSeries   = [...new Set(rows.map(r => r.ctoon.series?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const allRarities = [...new Set(rows.map(r => r.ctoon.rarity?.trim()).filter(Boolean))]
  const inPriority  = PRIORITY_RARITIES.filter(r => allRarities.includes(r))
  const extras      = allRarities.filter(r => !PRIORITY_RARITIES.includes(r)).sort()

  return {
    sets:          ['All', ...allSets],
    seriesOptions: ['All', ...allSeries],
    rarities:      ['All', ...inPriority, ...extras]
  }
})

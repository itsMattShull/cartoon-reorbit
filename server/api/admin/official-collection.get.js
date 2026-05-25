// server/api/admin/official-collection.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
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

  const q = getQuery(event)
  const page          = Math.max(1, parseInt(q.page)  || 1)
  const limit         = Math.min(200, Math.max(1, parseInt(q.limit) || 100))
  const name          = q.name?.trim()   || ''
  const setFilter     = q.set?.trim()    || ''
  const seriesFilter  = q.series?.trim() || ''
  const rarity        = q.rarity?.trim() || ''
  const duplicatesOnly = q.duplicatesOnly === 'true'
  const ownedFilter   = q.ownedFilter    || 'all'   // 'all' | 'owned' | 'unowned'
  const targetUsername = q.targetUsername?.trim() || ''
  const wishlistOnly  = q.wishlistOnly === 'true'

  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

  const officialUser = await prisma.user.findUnique({
    where: { username: officialUsername },
    select: { id: true }
  })
  if (!officialUser) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }

  // ── Collect locked IDs (lightweight id-only query) ──────────────────────────
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

  // ── Build where clause ───────────────────────────────────────────────────────
  const where = {
    userId: officialUser.id,
    burnedAt: null,
    ...(isMattShull ? {} : { isTradeable: true }),
    ...(lockedIds.length ? { id: { notIn: lockedIds } } : {})
  }

  // Ctoon-level filters
  const ctoonWhere = {}
  if (name)         ctoonWhere.name   = { contains: name,   mode: 'insensitive' }
  if (setFilter)    ctoonWhere.set    = { equals: setFilter }
  if (seriesFilter) ctoonWhere.series = { equals: seriesFilter }
  if (rarity)       ctoonWhere.rarity = { equals: rarity }
  if (Object.keys(ctoonWhere).length) where.ctoon = { is: ctoonWhere }

  const andConditions = []

  // Duplicates-only filter
  if (duplicatesOnly) {
    const baseWhere = { userId: officialUser.id, burnedAt: null, ...(isMattShull ? {} : { isTradeable: true }) }
    const groups = await prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: baseWhere,
      having: { ctoonId: { _count: { gt: 1 } } }
    })
    andConditions.push({ ctoonId: { in: groups.map(g => g.ctoonId) } })
  }

  // Cross-reference owned/unowned + badge data
  let targetCtoonIds = null
  if (targetUsername) {
    const targetUser = await prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true }
    })
    if (targetUser) {
      const rows = await prisma.userCtoon.findMany({
        where: { userId: targetUser.id, burnedAt: null, isTradeable: true },
        select: { ctoonId: true }
      })
      targetCtoonIds = rows.map(r => r.ctoonId)

      if (ownedFilter === 'owned') {
        andConditions.push({ ctoonId: { in: targetCtoonIds } })
      } else if (ownedFilter === 'unowned') {
        andConditions.push({ NOT: { ctoonId: { in: targetCtoonIds } } })
      }
    }
  }

  // Wishlist-only filter
  if (wishlistOnly && targetUsername) {
    const wishlistRows = await prisma.wishlistItem.findMany({
      where: { user: { username: targetUsername } },
      select: { ctoonId: true }
    })
    andConditions.push({ ctoonId: { in: wishlistRows.map(w => w.ctoonId) } })
  }

  if (andConditions.length) where.AND = andConditions

  // ── Count + fetch page ───────────────────────────────────────────────────────
  const [total, rows] = await Promise.all([
    prisma.userCtoon.count({ where }),
    prisma.userCtoon.findMany({
      where,
      include: { ctoon: true },
      orderBy: [
        { ctoon: { name: 'asc' } },
        { ctoonId: 'asc' },
        { mintNumber: 'asc' }
      ],
      skip: (page - 1) * limit,
      take: limit
    })
  ])

  // ── Holiday lookup for this page ─────────────────────────────────────────────
  const ctoonIds = rows.map(uc => uc.ctoonId)
  const holidayRows = ctoonIds.length
    ? await prisma.holidayEventItem.findMany({ where: { ctoonId: { in: ctoonIds } }, select: { ctoonId: true } })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  const targetOwnsSet = new Set(targetCtoonIds ?? [])

  return {
    items: rows.map(uc => ({
      id:             uc.id,
      ctoonId:        uc.ctoonId,
      assetPath:      uc.ctoon.assetPath,
      name:           uc.ctoon.name,
      series:         uc.ctoon.series?.trim() || null,
      set:            uc.ctoon.set?.trim()    || null,
      rarity:         uc.ctoon.rarity?.trim() || null,
      isGtoon:        uc.ctoon.isGtoon,
      cost:           uc.ctoon.cost,
      power:          uc.ctoon.power,
      mintNumber:     uc.mintNumber,
      quantity:       uc.ctoon.quantity,
      isFirstEdition: uc.isFirstEdition,
      isHolidayItem:  holidaySet.has(uc.ctoonId),
      inPendingTrade: false, // already excluded from results
      otherOwns:      targetOwnsSet.has(uc.ctoonId)
    })),
    total,
    page,
    limit
  }
})

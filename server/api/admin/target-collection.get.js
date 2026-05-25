// server/api/admin/target-collection.get.js
// Admin-only paginated endpoint for browsing a target user's collection on the
// initiate-trade page. Supports server-side filtering + cross-ownership badge data.
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'

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

  const q = getQuery(event)
  const username       = q.username?.trim()
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  const page           = Math.max(1, parseInt(q.page)  || 1)
  const limit          = Math.min(200, Math.max(1, parseInt(q.limit) || 100))
  const name           = q.name?.trim()   || ''
  const setFilter      = q.set?.trim()    || ''
  const seriesFilter   = q.series?.trim() || ''
  const rarity         = q.rarity?.trim() || ''
  const duplicatesOnly = q.duplicatesOnly === 'true'
  const ownedFilter    = q.ownedFilter    || 'all' // 'all' | 'owned' | 'unowned'
  const ownedByUsername = q.ownedByUsername?.trim() || '' // e.g. official account

  // Fetch target user
  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true }
  })
  if (!targetUser) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  // ── Build where clause ───────────────────────────────────────────────────────
  const ctoonWhere = {}
  if (name)         ctoonWhere.name   = { contains: name,   mode: 'insensitive' }
  if (setFilter)    ctoonWhere.set    = { equals: setFilter }
  if (seriesFilter) ctoonWhere.series = { equals: seriesFilter }
  if (rarity)       ctoonWhere.rarity = { equals: rarity }

  const where = {
    userId: targetUser.id,
    burnedAt: null,
    isTradeable: true,
    ...(Object.keys(ctoonWhere).length ? { ctoon: { is: ctoonWhere } } : {})
  }

  const andConditions = []

  // Duplicates-only filter
  if (duplicatesOnly) {
    const groups = await prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: { userId: targetUser.id, burnedAt: null, isTradeable: true },
      having: { ctoonId: { _count: { gt: 1 } } }
    })
    andConditions.push({ ctoonId: { in: groups.map(g => g.ctoonId) } })
  }

  // Cross-reference owned/unowned filter + badge data (load once)
  let otherCtoonIds = null
  if (ownedByUsername) {
    const otherUser = await prisma.user.findUnique({
      where: { username: ownedByUsername },
      select: { id: true }
    })
    if (otherUser) {
      const otherRows = await prisma.userCtoon.findMany({
        where: { userId: otherUser.id, burnedAt: null },
        select: { ctoonId: true }
      })
      otherCtoonIds = otherRows.map(r => r.ctoonId)

      if (ownedFilter === 'owned') {
        andConditions.push({ ctoonId: { in: otherCtoonIds } })
      } else if (ownedFilter === 'unowned') {
        andConditions.push({ NOT: { ctoonId: { in: otherCtoonIds } } })
      }
    }
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

  // ── Supplementary lookups for this page ─────────────────────────────────────
  const ctoonIds  = rows.map(uc => uc.ctoonId)
  const ucIds     = rows.map(uc => uc.id)

  const [holidayRows, pendingTradeRows] = await Promise.all([
    ctoonIds.length
      ? prisma.holidayEventItem.findMany({ where: { ctoonId: { in: ctoonIds } }, select: { ctoonId: true } })
      : [],
    ucIds.length
      ? prisma.tradeOfferCtoon.findMany({
          where: { userCtoonId: { in: ucIds }, tradeOffer: { status: 'PENDING' } },
          select: { userCtoonId: true }
        })
      : []
  ])

  const holidaySet     = new Set(holidayRows.map(r => r.ctoonId))
  const pendingTradeSet = new Set(pendingTradeRows.map(r => r.userCtoonId))
  const otherOwnsSet   = new Set(otherCtoonIds ?? [])

  return {
    items: rows.map(uc => ({
      id:             encodeUserCtoonId(uc.userId, uc.ctoonId, uc.mintNumber),
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
      inPendingTrade: pendingTradeSet.has(uc.id),
      otherOwns:      otherOwnsSet.has(uc.ctoonId)
    })),
    total,
    page,
    limit
  }
})

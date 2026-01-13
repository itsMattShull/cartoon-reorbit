import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

function normalizeListParam(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(Boolean)
  }
  return []
}

function isTruthy(value) {
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase())
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildCharacterMatches(value) {
  const raw = value.trim()
  if (!raw) return []
  const variants = new Set([raw, raw.toLowerCase(), raw.toUpperCase(), toTitleCase(raw)])
  return [...variants].filter(Boolean)
}

function intersectLists(a, b) {
  if (!a || !b) return []
  const bSet = new Set(b)
  return a.filter(id => bSet.has(id))
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const { page = '1', limit = '50' } = query
  const pageNum = Math.max(1, parseInt(String(page), 10) || 1)
  const take = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50))
  const skip = (pageNum - 1) * take

  const search = typeof query.q === 'string' ? query.q.trim() : ''
  const series = normalizeListParam(query.series)
  const rarities = normalizeListParam(query.rarity)
  const ownedFilter = typeof query.owned === 'string' ? query.owned : ''
  const featuredOnly = isTruthy(query.featured)
  const wishlistOnly = isTruthy(query.wishlist)
  const hasBidsOnly = isTruthy(query.hasBids)

  let ownedIds = null
  let ownedSet = null
  let wishlistIds = null
  let ctoonIdFilter = null
  let ctoonIdExclude = null

  if (ownedFilter === 'owned' || ownedFilter === 'unowned') {
    const ownedRows = await prisma.userCtoon.findMany({
      where: { userId },
      select: { ctoonId: true }
    })
    ownedIds = ownedRows.map(r => r.ctoonId)
    ownedSet = new Set(ownedIds)
    if (ownedFilter === 'owned' && ownedIds.length === 0) {
      return { page: pageNum, pageSize: take, total: 0, totalPages: 1, items: [] }
    }
  }

  if (wishlistOnly) {
    const wishlistRows = await prisma.wishlistItem.findMany({
      where: { userId },
      select: { ctoonId: true }
    })
    wishlistIds = wishlistRows.map(r => r.ctoonId)
    if (wishlistIds.length === 0) {
      return { page: pageNum, pageSize: take, total: 0, totalPages: 1, items: [] }
    }
    ctoonIdFilter = wishlistIds
  }

  if (ownedFilter === 'owned') {
    ctoonIdFilter = ctoonIdFilter ? intersectLists(ctoonIdFilter, ownedIds) : ownedIds
  } else if (ownedFilter === 'unowned' && ownedIds && ownedIds.length) {
    if (ctoonIdFilter) {
      ctoonIdFilter = ctoonIdFilter.filter(id => !ownedSet.has(id))
    } else {
      ctoonIdExclude = ownedIds
    }
  }

  if (ctoonIdFilter && ctoonIdFilter.length === 0) {
    return { page: pageNum, pageSize: take, total: 0, totalPages: 1, items: [] }
  }

  const ctoonWhere = {}
  if (series.length) ctoonWhere.series = { in: series }
  if (rarities.length) ctoonWhere.rarity = { in: rarities }
  if (search) {
    const characterValues = buildCharacterMatches(search)
    ctoonWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      ...(characterValues.length ? [{ characters: { hasSome: characterValues } }] : [])
    ]
  }
  if (ctoonIdFilter) ctoonWhere.id = { in: ctoonIdFilter }
  else if (ctoonIdExclude && ctoonIdExclude.length) ctoonWhere.id = { notIn: ctoonIdExclude }

  const where = { status: 'CLOSED' }
  if (featuredOnly) where.isFeatured = true
  if (hasBidsOnly) where.bids = { some: {} }
  if (Object.keys(ctoonWhere).length) where.userCtoon = { ctoon: ctoonWhere }

  const [total, auctions] = await Promise.all([
    prisma.auction.count({ where }),
    prisma.auction.findMany({
      where,
      orderBy: { endAt: 'desc' },
      skip,
      take,
      include: {
        userCtoon: {
          select: {
            id: true,
            ctoonId: true,
            mintNumber: true,
            ctoon: {
              select: {
                assetPath: true,
                name: true,
                rarity: true,
                series: true,
                characters: true,
                price: true,
              },
            },
          },
        },
        bids: {
          orderBy: { amount: 'desc' },
          take: 1,
          select: {
            amount: true,
            user: { select: { username: true } },
          },
        },
        _count: { select: { bids: true } },
      },
    })
  ])

  const totalPages = Math.max(1, Math.ceil(total / take))
  const ctoonIds = auctions
    .map(a => a.userCtoon?.ctoonId)
    .filter(Boolean)
  if (!ownedSet) {
    const owned = ctoonIds.length
      ? await prisma.userCtoon.findMany({
        where: { userId, ctoonId: { in: ctoonIds } },
        select: { ctoonId: true }
      })
      : []
    ownedSet = new Set(owned.map(o => o.ctoonId))
  }

  return {
    page: pageNum,
    pageSize: take,
    total,
    totalPages,
    items: auctions.map(a => ({
      id: a.id,
      status: a.status,
      isFeatured: a.isFeatured,
      userCtoonId: a.userCtoonId,
      ctoonId: a.userCtoon?.ctoonId ?? null,
      assetPath: a.userCtoon?.ctoon?.assetPath ?? null,
      name: a.userCtoon?.ctoon?.name ?? null,
      series: a.userCtoon?.ctoon?.series ?? null,
      rarity: a.userCtoon?.ctoon?.rarity ?? null,
      characters: a.userCtoon?.ctoon?.characters || [],
      price: a.userCtoon?.ctoon?.price ?? 0,
      mintNumber: a.userCtoon?.mintNumber ?? null,
      createdAt: a.createdAt.toISOString(),
      endAt: a.endAt.toISOString(),
      initialBid: a.initialBet,
      winningBid: a.bids[0]?.amount ?? null,
      winningBidder: a.bids[0]?.user?.username ?? null,
      bidCount: a._count?.bids ?? 0,
      isOwned: ownedSet.has(a.userCtoon?.ctoonId),
    })),
  }
})

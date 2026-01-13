// File: server/api/mybids.get.js
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

function applyAuctionFilters(items, filters) {
  const term = (filters.search || '').toLowerCase().trim()
  const seriesFilter = filters.series || []
  const rarityFilter = filters.rarities || []
  const ownedFilter = filters.owned || ''
  const requireFeatured = filters.featuredOnly
  const requireBids = filters.hasBidsOnly
  const wishlistSet = filters.wishlistSet || null

  return items.filter(item => {
    if (!item) return false
    if (term) {
      const nameMatch = (item.name || '').toLowerCase().includes(term)
      const chars = Array.isArray(item.characters) ? item.characters : []
      const charMatch = chars.some(ch => String(ch || '').toLowerCase().includes(term))
      if (!nameMatch && !charMatch) return false
    }
    if (seriesFilter.length && !seriesFilter.includes(item.series)) return false
    if (rarityFilter.length && !rarityFilter.includes(item.rarity)) return false
    if (requireFeatured && !item.isFeatured) return false
    if (ownedFilter === 'owned' && !item.isOwned) return false
    if (ownedFilter === 'unowned' && item.isOwned) return false
    if (wishlistSet && !wishlistSet.has(item.ctoonId)) return false
    if (requireBids && Number(item.bidCount ?? 0) < 1) return false
    return true
  })
}

function isEnded(endAt, now) {
  return new Date(endAt) <= now
}

function sortMyBids(items, sortKey, now) {
  const sorted = items.slice()
  switch (sortKey) {
    case 'recentAsc':
      return sorted.sort((a, b) => new Date(a.endAt) - new Date(b.endAt))
    case 'biggestBid':
      return sorted.sort((a, b) => {
        const aBid = a.myBid ?? Number.NEGATIVE_INFINITY
        const bBid = b.myBid ?? Number.NEGATIVE_INFINITY
        if (bBid !== aBid) return bBid - aBid
        return new Date(b.endAt) - new Date(a.endAt)
      })
    case 'recentlyWon':
      return sorted.sort((a, b) => {
        const aEnded = isEnded(a.endAt, now)
        const bEnded = isEnded(b.endAt, now)
        if (aEnded !== bEnded) return aEnded ? -1 : 1
        if (aEnded && bEnded && a.didWin !== b.didWin) return a.didWin ? -1 : 1
        return new Date(b.endAt) - new Date(a.endAt)
      })
    case 'recentlyLost':
      return sorted.sort((a, b) => {
        const aEnded = isEnded(a.endAt, now)
        const bEnded = isEnded(b.endAt, now)
        if (aEnded !== bEnded) return aEnded ? -1 : 1
        if (aEnded && bEnded && a.didWin !== b.didWin) return a.didWin ? 1 : -1
        return new Date(b.endAt) - new Date(a.endAt)
      })
    case 'recentDesc':
    default:
      return sorted.sort((a, b) => new Date(b.endAt) - new Date(a.endAt))
  }
}

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
  const sortKey = typeof query.sort === 'string' ? query.sort : 'recentDesc'
  const validSorts = ['recentDesc', 'recentAsc', 'biggestBid', 'recentlyWon', 'recentlyLost']
  const effectiveSort = validSorts.includes(sortKey) ? sortKey : 'recentDesc'

  let wishlistSet = null
  if (wishlistOnly) {
    const wishlistRows = await prisma.wishlistItem.findMany({
      where: { userId },
      select: { ctoonId: true }
    })
    const wishlistIds = wishlistRows.map(r => r.ctoonId)
    if (wishlistIds.length === 0) {
      return { page: pageNum, pageSize: take, total: 0, totalPages: 1, items: [] }
    }
    wishlistSet = new Set(wishlistIds)
  }

  // 2) Pull all bids by this user (only need auctionId + amount)
  const myBids = await prisma.bid.findMany({
    where: { userId },
    select: { auctionId: true, amount: true }
  })
  if (myBids.length === 0) {
    return { page: pageNum, pageSize: take, total: 0, totalPages: 1, items: [] }
  }

  // 3) Unique auction ids
  const auctionIds = [...new Set(myBids.map(b => b.auctionId))]

  // 4) Aggregate my highest bid per auction
  const myMaxRows = await prisma.bid.groupBy({
    by: ['auctionId'],
    where: { userId, auctionId: { in: auctionIds } },
    _max: { amount: true }
  })
  const myMaxMap = Object.fromEntries(
    myMaxRows.map(r => [r.auctionId, r._max.amount ?? null])
  )

  // 5) Aggregate overall highest bid per auction
  const allMaxRows = await prisma.bid.groupBy({
    by: ['auctionId'],
    where: { auctionId: { in: auctionIds } },
    _max: { amount: true },
    _count: { _all: true }
  })
  const allMaxMap = Object.fromEntries(
    allMaxRows.map(r => [r.auctionId, r._max.amount ?? null])
  )
  const bidCountMap = Object.fromEntries(
    allMaxRows.map(r => [r.auctionId, r._count._all ?? 0])
  )

  // 6) Load auctions + cToon + winner
  const auctions = await prisma.auction.findMany({
    where: { id: { in: auctionIds } },
    include: {
      userCtoon: {
        include: { ctoon: true }
      },
      winner: { select: { id: true, username: true } }
    }
  })

  const ctoonIds = auctions
    .map(a => a.userCtoon?.ctoonId)
    .filter(Boolean)
  const owned = ctoonIds.length
    ? await prisma.userCtoon.findMany({
      where: { userId, ctoonId: { in: ctoonIds } },
      select: { ctoonId: true }
    })
    : []
  const ownedSet = new Set(owned.map(o => o.ctoonId))

  const now = new Date()

  // 7) Shape response items
  const items = auctions.map(a => {
    const myBid = myMaxMap[a.id] ?? null
    const highestFromBids = allMaxMap[a.id] ?? null
    const highestBid = highestFromBids != null ? highestFromBids : (a.initialBet ?? null)
    const bidCount = bidCountMap[a.id] ?? 0

    const endAtISO = a.endAt instanceof Date ? a.endAt.toISOString() : new Date(a.endAt).toISOString()
    const ended = new Date(endAtISO) <= now

    return {
      id: a.id,
      userCtoonId: a.userCtoon?.id ?? null,
      ctoonId: a.userCtoon?.ctoonId ?? null,
      name: a.userCtoon?.ctoon?.name ?? 'Unknown',
      series: a.userCtoon?.ctoon?.series ?? null,
      rarity: a.userCtoon?.ctoon?.rarity ?? null,
      characters: a.userCtoon?.ctoon?.characters || [],
      assetPath: a.userCtoon?.ctoon?.assetPath ?? '',
      mintNumber: a.userCtoon?.mintNumber ?? null,
      endAt: endAtISO,
      isFeatured: !!a.isFeatured,
      isOwned: ownedSet.has(a.userCtoon?.ctoonId),
      myBid,
      highestBid,
      bidCount,
      didWin: ended && !!a.winner && a.winner.id === userId
    }
  })

  const filtered = applyAuctionFilters(items, {
    search,
    series,
    rarities,
    owned: ownedFilter,
    featuredOnly,
    wishlistSet,
    hasBidsOnly
  })

  const sorted = sortMyBids(filtered, effectiveSort, now)
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / take))
  const paged = sorted.slice(skip, skip + take)

  return {
    page: pageNum,
    pageSize: take,
    total,
    totalPages,
    items: paged
  }
})

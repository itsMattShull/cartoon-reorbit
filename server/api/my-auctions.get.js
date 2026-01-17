// File: server/api/my-auctions.get.js

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
  const setFilter = filters.sets || []
  const requireGtoons = filters.gtoonsOnly
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
    if (setFilter.length && !setFilter.includes(item.set)) return false
    if (requireGtoons && !item.isGtoon) return false
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

export default defineEventHandler(async (event) => {
  // 1. Authenticate
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
  const sets = normalizeListParam(query.set)
  const series = normalizeListParam(query.series)
  const rarities = normalizeListParam(query.rarity)
  const ownedFilter = typeof query.owned === 'string' ? query.owned : ''
  const featuredOnly = isTruthy(query.featured)
  const wishlistOnly = isTruthy(query.wishlist)
  const hasBidsOnly = isTruthy(query.hasBids)
  const gtoonsOnly = isTruthy(query.gtoon)

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

  // 2. Fetch this user’s auctions, with cToon and top bid/user
  const auctions = await prisma.auction.findMany({
    where: { creatorId: userId },
    include: {
      userCtoon: {
        select: {
          id: true,
          userId: true,
          ctoonId: true,
          mintNumber: true,
          ctoon: {
            select: {
              assetPath: true,
              name: true,
              rarity: true,
              series: true,
              set: true,
              isGtoon: true,
              characters: true,
              price: true,
            },
          },
          auctions: { where: { status: 'ACTIVE' }, select: { id: true } },
        },
      },
      bids: {
        orderBy: { amount: 'desc' },
        take: 1,
        select: {
          amount: true,
          user: {           // bidder relationship is called `user` on Bid
            select: { username: true },
          },
        },
      },
      _count: { select: { bids: true } },
    },
    orderBy: { endAt: 'desc' },
  })

  const items = auctions.map(a => ({
    id:               a.id,
    status:           a.status,
    isFeatured:       a.isFeatured,
    userCtoonId:      a.userCtoonId,
    ctoonId:          a.userCtoon?.ctoonId ?? null,
    assetPath:        a.userCtoon?.ctoon?.assetPath ?? null,
    name:             a.userCtoon?.ctoon?.name ?? null,
    set:              a.userCtoon?.ctoon?.set ?? null,
    series:           a.userCtoon?.ctoon?.series ?? null,
    rarity:           a.userCtoon?.ctoon?.rarity ?? null,
    isGtoon:          a.userCtoon?.ctoon?.isGtoon ?? false,
    characters:       a.userCtoon?.ctoon?.characters || [],
    price:            a.userCtoon?.ctoon?.price ?? 0,
    mintNumber:       a.userCtoon?.mintNumber ?? null,
    createdAt:        a.createdAt.toISOString(),
    endAt:            a.endAt.toISOString(),      // <— new
    initialBid:       a.initialBet,
    winningBid:       a.bids[0]?.amount ?? null,
    winningBidder:    a.bids[0]?.user.username ?? null,
    bidCount:         a._count?.bids ?? 0,
    isOwned:          a.userCtoon?.userId === userId,
    isOwner:          a.userCtoon?.userId === userId,
    hasActiveAuction: (a.userCtoon?.auctions?.length ?? 0) > 0,
  }))

  const filtered = applyAuctionFilters(items, {
    search,
    sets,
    series,
    rarities,
    owned: ownedFilter,
    featuredOnly,
    wishlistSet,
    hasBidsOnly,
    gtoonsOnly
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / take))
  const paged = filtered.slice(skip, skip + take)

  // 3. Return endAt so frontend can show “In Progress” vs “Ended”
  return {
    page: pageNum,
    pageSize: take,
    total,
    totalPages,
    items: paged
  }
})

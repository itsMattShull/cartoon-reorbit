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
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { page = '1', limit = '50' } = getQuery(event)
  const pageNum = Math.max(1, parseInt(String(page), 10) || 1)
  const take = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50))
  const skip = (pageNum - 1) * take

  const [total, auctions] = await Promise.all([
    prisma.auction.count(),
    prisma.auction.findMany({
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
  const owned = ctoonIds.length
    ? await prisma.userCtoon.findMany({
      where: { userId, ctoonId: { in: ctoonIds } },
      select: { ctoonId: true }
    })
    : []
  const ownedSet = new Set(owned.map(o => o.ctoonId))

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

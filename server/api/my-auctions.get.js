// File: server/api/my-auctions.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 3. Return endAt so frontend can show “In Progress” vs “Ended”
  return auctions.map(a => ({
    id:               a.id,
    status:           a.status,
    userCtoonId:      a.userCtoonId,
    ctoonId:          a.userCtoon?.ctoonId ?? null,
    assetPath:        a.userCtoon?.ctoon?.assetPath ?? null,
    name:             a.userCtoon?.ctoon?.name ?? null,
    rarity:           a.userCtoon?.ctoon?.rarity ?? null,
    price:            a.userCtoon?.ctoon?.price ?? 0,
    mintNumber:       a.userCtoon?.mintNumber ?? null,
    createdAt:        a.createdAt.toISOString(),
    endAt:            a.endAt.toISOString(),      // <— new
    initialBid:       a.initialBet,
    winningBid:       a.bids[0]?.amount ?? null,
    winningBidder:    a.bids[0]?.user.username ?? null,
    bidCount:         a._count?.bids ?? 0,
    isOwner:          a.userCtoon?.userId === userId,
    hasActiveAuction: (a.userCtoon?.auctions?.length ?? 0) > 0,
  }))
})

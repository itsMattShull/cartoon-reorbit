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
        include: {
          ctoon: {
            select: {
              assetPath: true,
              name: true,
            },
          },
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
    },
    orderBy: { endAt: 'desc' },
  })

  // 3. Return endAt so frontend can show “In Progress” vs “Ended”
  return auctions.map(a => ({
    id:            a.id,
    assetPath:     a.userCtoon.ctoon.assetPath,
    name:          a.userCtoon.ctoon.name,
    createdAt:     a.createdAt.toISOString(),
    endAt:         a.endAt.toISOString(),      // <— new
    initialBid:    a.initialBet,
    winningBid:    a.bids[0]?.amount ?? null,
    winningBidder: a.bids[0]?.user.username ?? null,
  }))
})

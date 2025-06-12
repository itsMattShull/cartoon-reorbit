import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getRequestHeader, createError } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
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

  // 2. Get auction ID from route
  const { id } = event.context.params
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing auction ID' })
  }

  // 3. Fetch auction with its cToon
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      userCtoon: {
        include: { ctoon: true }
      },
      winner:    { select: { username: true } }
    }
  })
  if (!auction) {
    throw createError({ statusCode: 404, statusMessage: 'Auction not found' })
  }

  // 4. Fetch bid history
  const bids = await prisma.bid.findMany({
    where: { auctionId: id },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'desc' }
  })

  // 5. Compute current highest bid
  const currentBid = bids.length > 0
    ? Math.max(...bids.map((b) => b.amount))
    : auction.initialBet

  // 6. Map and return
  return {
    id: auction.id,
    ctoon: {
      assetPath:  auction.userCtoon.ctoon.assetPath,
      name:       auction.userCtoon.ctoon.name,
      series:     auction.userCtoon.ctoon.series,
      rarity:     auction.userCtoon.ctoon.rarity,
      mintNumber: auction.userCtoon.mintNumber
    },
    endAt:      auction.endAt.toISOString(),
    initialBet: auction.initialBet,
    status:     auction.status,
    currentBid,
    bids: bids.map((b) => ({
      user:   b.user.username,
      amount: b.amount
    })),
    winnerUsername: auction.winner?.username || null
  }
})

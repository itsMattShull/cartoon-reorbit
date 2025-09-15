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
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { id } = event.context.params
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing auction ID' })

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      userCtoon: { include: { ctoon: true } },
      winner: { select: { username: true } },
      highestBidder: { select: { username: true } }
    }
  })
  if (!auction) throw createError({ statusCode: 404, statusMessage: 'Auction not found' })

  // Holiday flag for this cToon
  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: auction.userCtoon.ctoonId },
    select: { id: true }
  }))

  const bids = await prisma.bid.findMany({
    where: { auctionId: id },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'desc' }
  })

  const currentBid = bids.length > 0
    ? Math.max(...bids.map((b) => b.amount))
    : auction.initialBet

  return {
    id: auction.id,
    ctoon: {
      assetPath:  auction.userCtoon.ctoon.assetPath,
      name:       auction.userCtoon.ctoon.name,
      series:     auction.userCtoon.ctoon.series,
      rarity:     auction.userCtoon.ctoon.rarity,
      mintNumber: auction.userCtoon.mintNumber
    },
    isHolidayItem, // ← added
    endAt:      auction.endAt.toISOString(),
    initialBet: auction.initialBet,
    status:     auction.status,
    highestBid: auction.highestBid ?? currentBid,
    highestBidderUsername: auction.highestBidder?.username || null,
    bids: bids.map(b => ({ user: b.user.username, amount: b.amount })),
    winnerUsername: auction.winner?.username || null
  }
})

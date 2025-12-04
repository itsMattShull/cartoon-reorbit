// File: server/api/mybids.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2) Pull all bids by this user (only need auctionId + amount)
  const myBids = await prisma.bid.findMany({
    where: { userId },
    select: { auctionId: true, amount: true }
  })
  if (myBids.length === 0) return []

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
    _max: { amount: true }
  })
  const allMaxMap = Object.fromEntries(
    allMaxRows.map(r => [r.auctionId, r._max.amount ?? null])
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

  const now = new Date()

  // 7) Shape response items
  const items = auctions.map(a => {
    const myBid = myMaxMap[a.id] ?? null
    const highestFromBids = allMaxMap[a.id] ?? null
    const highestBid = highestFromBids != null ? highestFromBids : (a.initialBet ?? null)

    const endAtISO = a.endAt instanceof Date ? a.endAt.toISOString() : new Date(a.endAt).toISOString()
    const ended = new Date(endAtISO) <= now

    return {
      id: a.id,
      name: a.userCtoon?.ctoon?.name ?? 'Unknown',
      assetPath: a.userCtoon?.ctoon?.assetPath ?? '',
      endAt: endAtISO,
      myBid,
      highestBid,
      didWin: ended && !!a.winner && a.winner.id === userId
    }
  })

  // 8) Sort: endAt descending (newest endAt first)
  items.sort((a, b) => new Date(b.endAt) - new Date(a.endAt))

  return items
})

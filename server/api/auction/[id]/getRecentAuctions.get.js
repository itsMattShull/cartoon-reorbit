// server/api/auction/[id]/getRecentAuctions.get.js

import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Parse auction ID from URL
  const { id } = event.context.params
  if (!id) {
    throw createError({ statusCode: 422, statusMessage: 'Missing auction ID' })
  }

  // 2. Fetch the auction to determine which Ctoon (or pack) it was
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      userCtoon: { select: { ctoonId: true } },
      userPack: { select: { packId: true } }
    }
  })
  if (!auction) {
    throw createError({ statusCode: 404, statusMessage: 'Auction not found' })
  }

  // 3. Find the last 3 closed, successfully sold auctions for this same item
  const recent = await prisma.auction.findMany({
    where: auction.userPack
      ? { userPack: { packId: auction.userPack.packId }, status: 'CLOSED', winnerId: { not: null } }
      : { userCtoon: { ctoonId: auction.userCtoon.ctoonId }, status: 'CLOSED', winnerId: { not: null } },
    orderBy: { endAt: 'desc' },
    take: 3,
    select: {
      endAt: true,
      highestBid: true
    }
  })

  // 4. Return only the end date and sale price
  return recent.map(a => ({
    endedAt: a.endAt,
    soldFor: a.highestBid
  }))
})

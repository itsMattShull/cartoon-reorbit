// GET /api/packs/:id/recent-sales
// The last few SOLD auctions of this pack TYPE: [{ endedAt, soldFor }]. Price guidance for the "Send to Auction" modal
// (cToons get this from /api/ctoon/:id/getRecentAuctions). Same data the public auction history already shows, so it is
// open to any logged-in player; it exposes no seller or buyer.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { isUuid } from '@/server/utils/tradeOfferRules'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  const id = String(event.context.params?.id || '').toLowerCase()
  if (!isUuid(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid pack id' })

  const recent = await prisma.auction.findMany({
    where: { kind: 'PACK', userPack: { packId: id }, status: 'CLOSED', winnerId: { not: null } },
    orderBy: { endAt: 'desc' },
    take: 3,
    select: { endAt: true, highestBid: true }
  })
  return recent.map(a => ({ endedAt: a.endAt, soldFor: a.highestBid }))
})

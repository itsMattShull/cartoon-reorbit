// POST /api/admin/trade-auction-bans  { userIds: [idA, idB], reason?: string }
// Bans two users from trading with each other and bidding on each other's auctions, withdraws their pending trades
// with each other and turns off their auto-bids on each other's active auctions (server/utils/tradeAuctionBan.js).
import { defineEventHandler, readBody } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { createTradeAuctionBan } from '@/server/utils/tradeAuctionBan'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const admin = await requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const userIds = Array.isArray(body?.userIds) ? body.userIds : []
  return createTradeAuctionBan(prisma, { admin, userIds, reason: body?.reason })
})

// GET /api/admin/trade-auction-bans — the admin "Ban Trades/Auctions" list, newest first.
// Query: page, limit (max 100), user (username contains, either side of the pair).
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { listTradeAuctionBans } from '@/server/utils/tradeAuctionBan'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const page = Math.max(parseInt(q.page || '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(q.limit || '25', 10) || 25, 1), 100)
  const user = typeof q.user === 'string' ? q.user.trim().slice(0, 64) : ''
  return listTradeAuctionBans(prisma, { page, limit, user })
})

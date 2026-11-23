// DELETE /api/admin/trade-auction-bans/:id — lifts a trade/auction ban. Restores nothing it withdrew or turned off.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { deleteTradeAuctionBan } from '@/server/utils/tradeAuctionBan'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const admin = await requireAdmin(event)
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Ban id is required.' })
  return deleteTradeAuctionBan(prisma, { admin, id })
})

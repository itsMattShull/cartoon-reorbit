// GET /api/admin/trade-reversal/trades/:id — what undoing this trade would do right now, with and without fair market
// value, for the Undo Trade modal. Read-only; the reversal itself re-checks everything under row locks.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { previewTradeReversal } from '@/server/utils/tradeReversal'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Trade id is required.' })
  return previewTradeReversal(prisma, id)
})

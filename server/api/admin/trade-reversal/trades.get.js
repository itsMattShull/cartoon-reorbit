// GET /api/admin/trade-reversal/trades — accepted trades for the admin Trade Reversal tool, newest first.
// Query: page, limit (max 100), user (username contains, either side), reversed = all | yes | no.
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { listTradesForReversal } from '@/server/utils/tradeReversal'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const page = Math.max(parseInt(q.page || '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(q.limit || '25', 10) || 25, 1), 100)
  const user = typeof q.user === 'string' ? q.user.trim().slice(0, 64) : ''
  const reversed = ['yes', 'no'].includes(q.reversed) ? q.reversed : 'all'
  return listTradesForReversal(prisma, { page, limit, user, reversed })
})

// server/api/auction/[id]/autobid.delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

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
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // 2) Params
  const { id } = event.context.params
  const auctionId = String(id)

  // 3) (Optional) Check auction exists (allow deletion even if ended/cancelled)
  const auc = await db.auction.findUnique({
    where: { id: auctionId },
    select: { id: true }
  })
  if (!auc) {
    throw createError({ statusCode: 404, statusMessage: 'Auction not found' })
  }

  // 4) Delete any autobid rows for this user/auction
  //    (deleteMany to avoid throwing if none exist)
  const { count } = await db.auctionAutoBid.deleteMany({
    where: { auctionId, userId }
  })

  return {
    ok: true,
    removed: count > 0,
    auctionId,
    userId
  }
})

// server/api/auction/[id]/autobid.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const { id } = event.context.params
  const setting = await db.auctionAutoBid.findUnique({
    where: { auctionId_userId: { auctionId: String(id), userId: me.id } }
  })
  return setting ? { maxAmount: setting.maxAmount, isActive: setting.isActive } : { maxAmount: 0, isActive: false }
})

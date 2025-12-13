import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const data = {}
  if (typeof body?.allowAuctionNotifications !== 'undefined') {
    data.allowAuctionNotifications = Boolean(body.allowAuctionNotifications)
  }
  if (typeof body?.allowWishlistAuctionNotifications !== 'undefined') {
    data.allowWishlistAuctionNotifications = Boolean(body.allowWishlistAuctionNotifications)
  }
  if (Object.keys(data).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  const updated = await db.user.update({
    where: { id: me.id },
    data,
    select: { allowAuctionNotifications: true, allowWishlistAuctionNotifications: true }
  })
  return {
    allowAuctionNotifications: updated.allowAuctionNotifications,
    allowWishlistAuctionNotifications: updated.allowWishlistAuctionNotifications
  }
})

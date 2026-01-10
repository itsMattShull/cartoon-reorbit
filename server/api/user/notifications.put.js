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
  const next = Boolean(body?.allowAuctionNotifications)

  const updated = await db.user.update({
    where: { id: me.id },
    data: { allowAuctionNotifications: next },
    select: { allowAuctionNotifications: true }
  })
  return { allowAuctionNotifications: updated.allowAuctionNotifications }
})

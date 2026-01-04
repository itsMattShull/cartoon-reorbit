import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const rows = await db.announcement.findMany({
    where: { sentAt: null },
    orderBy: { scheduledAt: 'asc' },
    select: {
      id: true,
      message: true,
      pingOption: true,
      imagePath: true,
      imagePath2: true,
      imagePath3: true,
      scheduledAt: true,
      createdAt: true,
      sentAt: true,
      sendError: true,
      sendErrorAt: true
    }
  })

  return { items: rows }
})

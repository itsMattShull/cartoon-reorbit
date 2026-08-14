// The notification drawer's payload: newest N for the caller, plus the unread
// count so the badge and the list can never disagree with each other.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

// Deliberately fixed, and deliberately not read from the query string. An
// attacker-supplied `?limit=` is the read-side version of an unbounded write.
const PAGE_SIZE = 30

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      // No userId, and no route: the client builds the path from `type` and
      // `contextId`. See the Notification model note in prisma/schema.prisma.
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        contextType: true,
        contextId: true,
        count: true,
        readAt: true,
        createdAt: true
      }
    }),
    db.notification.count({ where: { userId, readAt: null } })
  ])

  return { items, unreadCount }
})

// GET /api/economy/chat/timeout-status?room= — whether the CALLER currently
// has an active chat timeout, and when it ends. Read once on chat open so the
// compose box starts correctly disabled even before any `chat:timeout` socket
// event has ever reached this tab (e.g. a timeout issued while the tab was
// closed, or on a fresh page load).
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { firstQueryValue } from '@/server/utils/economyFilters'

const DEFAULT_ROOM = 'economy'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const room = firstQueryValue(query, 'room') || DEFAULT_ROOM

  const active = await prisma.chatTimeout.findFirst({
    where: { room, userId: event.context.userId, liftedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
    select: { expiresAt: true, reason: true }
  })

  return active
    ? { timedOut: true, expiresAt: active.expiresAt, reason: active.reason }
    : { timedOut: false }
})

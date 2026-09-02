// GET /api/economy/chat/history?room=economy&before=&limit=
// Paginated chat history, newest page first. `before` (an ISO timestamp) walks
// further back for infinite-scroll-up; live messages arrive over the socket
// (server/socket-server.js's `chat:send`/`chat:message`), not through here.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { firstQueryValue } from '@/server/utils/economyFilters'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const DEFAULT_ROOM = 'economy'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const room = firstQueryValue(query, 'room') || DEFAULT_ROOM

  const rawBefore = firstQueryValue(query, 'before')
  const before = rawBefore ? new Date(rawBefore) : null
  const hasValidBefore = before && !Number.isNaN(before.getTime())

  const rawLimit = parseInt(firstQueryValue(query, 'limit'), 10)
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT))

  const rows = await prisma.chatMessage.findMany({
    where: {
      room,
      deletedAt: null,
      ...(hasValidBefore ? { createdAt: { lt: before } } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: { id: true, userId: true, username: true, body: true, createdAt: true }
  })

  const hasMore = rows.length > limit
  const messages = hasMore ? rows.slice(0, limit) : rows

  return { messages, hasMore }
})

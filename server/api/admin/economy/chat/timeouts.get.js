// GET /api/admin/economy/chat/timeouts?room= — active (non-lifted, unexpired)
// chat timeouts, for the admin-only panel in LiveChat.vue. Actually
// creating/lifting a timeout goes through the `admin:chat:timeout(-lifted)`
// socket events (server/socket-server.js) so every open chat tab updates
// live; this GET exists purely so an admin who opens chat after a timeout
// was issued still sees who's currently muted, not just future changes.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { firstQueryValue } from '@/server/utils/economyFilters'

const DEFAULT_ROOM = 'economy'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const query = getQuery(event)
  const room = firstQueryValue(query, 'room') || DEFAULT_ROOM

  const rows = await prisma.chatTimeout.findMany({
    where: { room, liftedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'asc' },
    select: {
      id: true,
      userId: true,
      reason: true,
      expiresAt: true,
      user: { select: { username: true } }
    }
  })

  return {
    timeouts: rows.map(r => ({
      id: r.id,
      userId: r.userId,
      username: r.user?.username || 'Unknown',
      reason: r.reason,
      expiresAt: r.expiresAt
    }))
  }
})

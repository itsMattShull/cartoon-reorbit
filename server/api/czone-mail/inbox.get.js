// server/api/czone-mail/inbox.get.js
// The recipient's own cMail, newest first, cursor-paginated.

import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

const MAX_LIMIT = 25

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const q = getQuery(event)
  // Clamp rather than trust: an unbounded `limit` is a trivial way to make the
  // database do arbitrary work.
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 10))
  const cursor = typeof q.cursor === 'string' && q.cursor ? q.cursor : null
  const unreadOnly = String(q.unreadOnly || '') === '1'

  const where = {
    recipientId: userId,
    deletedAt: null,
    ...(unreadOnly ? { readAt: null } : {})
  }

  const rows = await db.cZoneMail.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      emoji: true,
      readAt: true,
      hiddenFromWall: true,
      createdAt: true,
      // Never `include: { sender: true }` — that is SELECT * on the widest model
      // in the schema (tokens, roles) for every row.
      sender: { select: { username: true, avatar: true } }
    }
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return {
    items: page.map(r => ({
      id: r.id,
      body: r.body,
      emoji: r.emoji,
      read: !!r.readAt,
      hiddenFromWall: !!r.hiddenFromWall,
      createdAt: r.createdAt,
      senderUsername: r.sender?.username || null,
      senderAvatar: r.sender?.avatar || null
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null
  }
})

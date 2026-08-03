// server/api/czone-mail/blocks/index.get.js
// The players this user has blocked from sending them cMail.

import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const rows = await db.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      blocked: { select: { username: true, avatar: true } }
    }
  })

  return {
    items: rows.map(r => ({
      id: r.id,
      username: r.blocked?.username || null,
      avatar: r.blocked?.avatar || null,
      createdAt: r.createdAt
    }))
  }
})

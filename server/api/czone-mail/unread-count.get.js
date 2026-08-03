// server/api/czone-mail/unread-count.get.js
// Backs the unread badge on the My cWorld "cMail" button. Served by the partial
// index on (recipientId) WHERE readAt IS NULL, so this is an index-only scan
// over the few unread rows rather than a count over the whole table.

import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const count = await db.cZoneMail.count({
    where: { recipientId: userId, readAt: null, deletedAt: null }
  })
  return { count }
})

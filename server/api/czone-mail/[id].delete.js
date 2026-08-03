// server/api/czone-mail/[id].delete.js
// Recipient removes a message from their inbox and their public wall.
//
// This is a SOFT delete. A player's first instinct on receiving something
// upsetting is to delete it, and that must not destroy the only record before a
// parent or admin can look at it. The row disappears from every player-facing
// query and is pruned by the normal retention job.

import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing message id.' })

  // Scoped update: a message belonging to someone else simply matches nothing.
  const result = await db.cZoneMail.updateMany({
    where: { id, recipientId: userId, deletedAt: null },
    data: { deletedAt: new Date() }
  })

  if (result.count === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  }
  return { success: true }
})

// server/api/czone-mail/[id]/wall-visibility.post.js
// Recipient hides (or re-shows) one message on their public cZone wall without
// removing it from their own inbox.

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing message id.' })

  const body = await readBody(event)
  const hidden = Boolean(body?.hidden)

  const result = await db.cZoneMail.updateMany({
    where: { id, recipientId: userId, deletedAt: null },
    data: { hiddenFromWall: hidden ? new Date() : null }
  })

  if (result.count === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  }
  return { success: true, hidden }
})

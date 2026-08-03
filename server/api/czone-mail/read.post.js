// server/api/czone-mail/read.post.js
// Mark cMail as read. Scoped by recipientId in the WHERE clause rather than
// fetch-then-compare, so one player can never mark another's mail read (which
// would hide a message they were meant to see) and no 403/404 difference leaks
// whether a given message id exists.

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

const MAX_IDS = 100

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter(id => typeof id === 'string' && id).slice(0, MAX_IDS)
    : null

  const where = {
    recipientId: userId,
    readAt: null,
    deletedAt: null,
    ...(ids ? { id: { in: ids } } : {})
  }

  const result = await db.cZoneMail.updateMany({ where, data: { readAt: new Date() } })
  return { updated: result.count }
})

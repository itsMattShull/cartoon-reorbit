// server/api/cmoon/change-request.delete.js
// Cancels the logged-in user's own pending team-change request. Scoped strictly to
// event.context.userId + status: 'IN_REVIEW' — never accepts a client-supplied request id, so
// one player can never cancel another player's request or reach an already-resolved one.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const result = await db.cMoonChangeRequest.deleteMany({
    where: { userId, status: 'IN_REVIEW' },
  })
  if (result.count === 0) throw createError({ statusCode: 404, statusMessage: 'No pending request to cancel' })

  return { ok: true }
})

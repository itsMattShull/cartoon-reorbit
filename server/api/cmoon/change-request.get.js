// server/api/cmoon/change-request.get.js
// The logged-in user's own pending (IN_REVIEW) team-change request, if any. Never accepts a
// client-supplied request id — always scoped to event.context.userId, so one player can never
// read another player's request.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const request = await db.cMoonChangeRequest.findFirst({
    where: { userId, status: 'IN_REVIEW' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      requestedCMoon: { select: { id: true, name: true, color: true } },
    },
  })

  return { request }
})

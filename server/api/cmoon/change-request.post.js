// server/api/cmoon/change-request.post.js
// Player-submitted request to move to a different cMoon, approved/rejected by an admin (see
// server/api/admin/cmoon-change-requests*). At most one IN_REVIEW row per user: submitting again
// replaces the existing pending request rather than stacking a second row.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

const COOLDOWN_MS = 30_000

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) throw createError({ statusCode: 403, statusMessage: 'cMoons are not currently enabled' })

  const body = await readBody(event)
  const requestedCMoonId = typeof body?.requestedCMoonId === 'string' ? body.requestedCMoonId.trim() : ''
  if (!requestedCMoonId) throw createError({ statusCode: 400, statusMessage: 'requestedCMoonId is required' })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, cMoonId: true, banned: true },
  })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (user.banned) throw createError({ statusCode: 403, statusMessage: 'Banned accounts cannot request a team change' })
  // A player with no current cMoon uses the normal join flow (POST /api/cmoon/select), not a
  // change request — there's nothing to "change" from yet.
  if (!user.cMoonId) throw createError({ statusCode: 400, statusMessage: 'You must belong to a cMoon before requesting a team change' })
  if (requestedCMoonId === user.cMoonId) throw createError({ statusCode: 400, statusMessage: 'You already belong to this cMoon' })

  const targetCMoon = await db.cMoon.findUnique({
    where: { id: requestedCMoonId },
    select: { id: true, joinLocked: true },
  })
  if (!targetCMoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
  if (targetCMoon.joinLocked) throw createError({ statusCode: 403, statusMessage: 'This cMoon is not accepting new members' })

  const existing = await db.cMoonChangeRequest.findFirst({
    where: { userId, status: 'IN_REVIEW' },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) {
    const age = Date.now() - new Date(existing.updatedAt).getTime()
    if (age < COOLDOWN_MS) {
      throw createError({ statusCode: 429, statusMessage: 'Please wait a moment before submitting another request' })
    }
    await db.cMoonChangeRequest.update({
      where: { id: existing.id },
      data: { currentCMoonId: user.cMoonId, requestedCMoonId, createdAt: new Date() },
    })
  } else {
    await db.cMoonChangeRequest.create({
      data: { userId, currentCMoonId: user.cMoonId, requestedCMoonId },
    })
  }

  return { ok: true }
})

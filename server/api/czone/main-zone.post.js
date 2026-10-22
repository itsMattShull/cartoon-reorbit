// server/api/czone/main-zone.post.js
// Choose which of the caller's own cZone sub-zones (see CZone.layoutData.zones) is shown first
// when anyone loads their cZone — the explicit replacement for the old implicit "first zone with
// toons in it, else zone 1" behavior in server/api/czone/[username].get.js. See
// User.mainZoneIndex's own schema comment.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)

  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const index = Number(body?.index)
  if (!Number.isInteger(index) || index < 0) {
    throw createError({ statusCode: 400, statusMessage: 'index must be a non-negative integer' })
  }

  // Re-derive the caller's own zone count server-side rather than trusting a client-supplied
  // count — same reasoning as border.post.js re-checking ownership instead of trusting the body.
  const [config, user] = await Promise.all([
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { czoneCount: true } }),
    db.user.findUnique({ where: { id: userId }, select: { additionalCzones: true } })
  ])
  const baseCount = Number(config?.czoneCount ?? 3)
  const extraCount = Math.max(0, Number(user?.additionalCzones ?? 0))
  const targetCount = Math.max(1, baseCount + extraCount)

  if (index > targetCount - 1) {
    throw createError({ statusCode: 400, statusMessage: `You only have ${targetCount} cZone(s)` })
  }

  await db.user.update({ where: { id: userId }, data: { mainZoneIndex: index } })

  return { success: true, mainZoneIndex: index }
})

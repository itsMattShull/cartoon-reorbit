// server/api/czone/border.post.js
// Choose which earned cMoon-affinity cZone border (if any) is displayed on the caller's cZone. A
// member can own more than one (see UserCMoonBorder — affinity is permanent per-cMoon and
// survives leaving), so equipping is an explicit choice rather than always "whichever cMoon
// you're in". Ownership is re-checked from the database — never trust a client-supplied cMoonId
// blindly, same reasoning that flags server/api/auth/set-avatar.post.js's disk-existence-only
// check as the pattern NOT to copy.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)

  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const cMoonId = body?.cMoonId ? String(body.cMoonId) : null

  if (cMoonId) {
    const owned = await db.userCMoonBorder.findUnique({ where: { userId_cMoonId: { userId, cMoonId } } })
    if (!owned) throw createError({ statusCode: 403, statusMessage: 'You have not earned a border for that cMoon' })
  }

  await db.user.update({ where: { id: userId }, data: { equippedBorderCMoonId: cMoonId } })

  return { success: true, equippedBorderCMoonId: cMoonId }
})

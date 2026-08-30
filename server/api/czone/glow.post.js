// server/api/czone/glow.post.js
// Choose which earned cMoon-affinity cZone glow (if any) is displayed on the caller's cZone. A
// member can own more than one (see UserCMoonGlow — affinity is permanent per-cMoon and survives
// leaving), so equipping is an explicit choice rather than always "whichever cMoon you're in".
// Ownership is re-checked from the database — never trust a client-supplied cMoonId blindly, same
// reasoning that flags server/api/auth/set-avatar.post.js's disk-existence-only check as the
// pattern NOT to copy.
//
// Glow and border (see border.post.js) are mutually exclusive cZone cosmetics — a member can own
// both (from the same or different cMoons) but only one is ever displayed. Turning a glow ON here
// always clears any equipped border in the same write, so the two fields can never both be
// non-null at once; turning it off (cMoonId null) only clears this field, since the other
// cosmetic wasn't touched.
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
    const owned = await db.userCMoonGlow.findUnique({ where: { userId_cMoonId: { userId, cMoonId } } })
    if (!owned) throw createError({ statusCode: 403, statusMessage: 'You have not earned a glow for that cMoon' })
  }

  await db.user.update({
    where: { id: userId },
    data: cMoonId
      ? { equippedGlowCMoonId: cMoonId, equippedBorderCMoonId: null }
      : { equippedGlowCMoonId: null },
  })

  return { success: true, equippedGlowCMoonId: cMoonId }
})

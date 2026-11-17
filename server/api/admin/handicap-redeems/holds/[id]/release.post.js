// Manually releases one still-pending hold right now, ignoring the usual 3-other-claims
// threshold — for a code that will realistically never pick up 3 more redemptions (old, or
// already near maxClaims), the hold would otherwise sit open forever.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { forceReleaseHold } from '@/server/utils/codeRedemption'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const hold = await db.handicapRedeemHold.findUnique({ where: { id }, include: { user: { select: { username: true } }, code: { select: { code: true } } } })
  if (!hold) throw createError({ statusCode: 404, statusMessage: 'Hold not found' })

  const result = await forceReleaseHold(id)

  await logAdminChange(db, {
    userId: me.id, area: 'HandicapRedeems', key: `forceRelease:${id}`,
    prevValue: null, newValue: { username: hold.user.username, code: hold.code.code },
    targetUserId: hold.userId, targetUsername: hold.user.username
  })

  return { ok: true, result }
})

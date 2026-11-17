// Un-flags a player. Any already-pending hold on them is left exactly as it was — it still
// releases once enough other players have claimed that code, same as any other hold (or an
// admin can force-release it separately). Un-flagging only stops NEW redemptions from being held.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const userId = event.context.params?.userId
  const flag = await db.handicapRedeemer.findUnique({ where: { userId }, include: { user: { select: { username: true } } } })
  if (!flag) throw createError({ statusCode: 404, statusMessage: 'That player is not flagged' })

  await db.handicapRedeemer.delete({ where: { userId } })

  await logAdminChange(db, {
    userId: me.id, area: 'HandicapRedeems', key: `unflag:${userId}`,
    prevValue: { username: flag.user.username, reason: flag.reason }, newValue: null,
    targetUserId: userId, targetUsername: flag.user.username
  })

  return { ok: true }
})

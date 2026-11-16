// Bans a user from MyOrbit entirely (never joins/chats again until unbanned) — scoped to MyOrbit
// only, deliberately separate from the site-wide ban system (see User.myOrbitBannedAt's own
// schema comment). Also live-kicks them if they're currently in a room: the DB write alone would
// only block their NEXT join/chat attempt, but someone already standing in a room would otherwise
// keep walking/chatting until they happen to leave — the bridge call tells the live socket-server
// process to remove them right now.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitBanBody } from '@/server/utils/myOrbitModeration'
import { emitToSocketServer } from '@/server/utils/socketBridge'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMyOrbitBanBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, username: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await db.user.update({
    where: { id: target.id },
    data: { myOrbitBannedAt: new Date(), myOrbitBannedReason: parsed.data.reason }
  })

  await db.myOrbitModerationLog.create({
    data: { targetUserId: target.id, adminUserId: me.id, action: 'BAN', reason: parsed.data.reason }
  })
  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitModeration', key: `ban:${target.id}`,
    prevValue: null, newValue: { username: target.username, reason: parsed.data.reason }
  })

  // Best-effort and never rejects (see socketBridge.js's own header comment) — awaited anyway
  // since it resolves quickly (<=1.5s) and a kicked-while-present user should see it happen
  // before this request's own response reaches the admin.
  await emitToSocketServer('myorbit:adminKick', { userId: target.id, reason: parsed.data.reason })

  return { ok: true }
})

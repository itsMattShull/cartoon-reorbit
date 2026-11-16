// Mutes a user in MyOrbit chat for a set number of minutes. No live-kick bridge call needed —
// server/utils/myOrbitSocket.js's chat handler reads User.myOrbitMutedUntil fresh from the DB on
// every message attempt, so this takes effect on their very next message without anything
// needing to reach the live socket-server process.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitMuteBody } from '@/server/utils/myOrbitModeration'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMyOrbitMuteBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, username: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const mutedUntil = new Date(Date.now() + parsed.data.minutes * 60_000)
  await db.user.update({ where: { id: target.id }, data: { myOrbitMutedUntil: mutedUntil } })

  await db.myOrbitModerationLog.create({
    data: { targetUserId: target.id, adminUserId: me.id, action: 'MUTE', reason: parsed.data.reason }
  })
  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitModeration', key: `mute:${target.id}`,
    prevValue: null, newValue: { username: target.username, minutes: parsed.data.minutes }
  })

  return { ok: true, mutedUntil: mutedUntil.toISOString() }
})

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitUserIdBody } from '@/server/utils/myOrbitModeration'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMyOrbitUserIdBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, username: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await db.user.update({ where: { id: target.id }, data: { myOrbitBannedAt: null, myOrbitBannedReason: null } })

  await db.myOrbitModerationLog.create({ data: { targetUserId: target.id, adminUserId: me.id, action: 'UNBAN' } })
  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitModeration', key: `unban:${target.id}`,
    prevValue: null, newValue: { username: target.username }
  })

  return { ok: true }
})

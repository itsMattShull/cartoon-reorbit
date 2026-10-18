// server/api/admin/users/[id]/make-sub-admin.post.js
//
// Promotes a regular user to a sub-admin: isAdmin = true (so the existing admin gates let them in)
// plus isSubAdmin = true (so server/middleware/sub-admin-guard.js and the console nav withhold
// the high-risk tools — see utils/adminAccess.js). Any full admin may do this; a sub-admin may not.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  // requireAdmin lets a sub-admin through (they are isAdmin); promoting people is for full admins.
  const caller = await prisma.user.findUnique({ where: { id: me.id }, select: { isSubAdmin: true } })
  if (caller?.isSubAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — not available to sub-admins' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true, isSubAdmin: true, banned: true, active: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) {
    throw createError({ statusCode: 400, statusMessage: 'User is already an admin or sub-admin' })
  }
  if (target.banned || target.active === false) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot make a banned or deactivated user a sub-admin' })
  }

  await prisma.user.update({ where: { id }, data: { isAdmin: true, isSubAdmin: true } })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'makeSubAdmin',
    prevValue: { isAdmin: target.isAdmin, isSubAdmin: target.isSubAdmin },
    newValue: { isAdmin: true, isSubAdmin: true },
    targetUserId: target.id,
    targetUsername: target.username
  })

  return { ok: true }
})

// server/api/admin/users/[id]/remove-sub-admin.post.js
//
// Demotes a sub-admin back to a regular user (isAdmin = false, isSubAdmin = false). Only ever
// touches accounts flagged isSubAdmin, so it can't be used to strip a full admin; that stays with
// remove-admin (super-admin only). Any full admin may do this; a sub-admin may not.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const caller = await prisma.user.findUnique({ where: { id: me.id }, select: { isSubAdmin: true } })
  if (caller?.isSubAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — not available to sub-admins' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true, isSubAdmin: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (!target.isSubAdmin) {
    throw createError({ statusCode: 400, statusMessage: 'User is not a sub-admin' })
  }

  await prisma.user.update({ where: { id }, data: { isAdmin: false, isSubAdmin: false } })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'removeSubAdmin',
    prevValue: { isAdmin: target.isAdmin, isSubAdmin: target.isSubAdmin },
    newValue: { isAdmin: false, isSubAdmin: false },
    targetUserId: target.id,
    targetUsername: target.username
  })

  return { ok: true }
})

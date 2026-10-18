// POST /api/admin/users/[id]/admin-access
// Body: { level: 'sub' | 'none', permissions?: string[] }
//
// Makes a user a sub-admin, edits a sub-admin's tools, or removes a sub-admin. Only a FULL admin
// (isAdmin and not restricted) may call it; server/middleware/require-admin-scope.js already
// refuses sub-admins for this path, and the check is repeated here so the endpoint is safe
// even if that middleware is ever bypassed. Creating or removing a full admin stays with
// make-admin / remove-admin, which are super-admin only.
//
//   level 'sub'   target becomes a restricted admin with exactly `permissions` (at least one).
//                 A target that is already a FULL admin can only be converted by the super admin.
//   level 'none'  removes a sub-admin entirely. Refused for a full admin (use Remove Admin).
//
// Every change is written to the admin change log (area 'Admin:Users') against the target.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { getAdminScope, invalidateAdminScope } from '@/server/utils/adminScope'
import { SUPER_ADMIN_DISCORD_ID } from '@/server/utils/adminAuth'
import { ADMIN_PERMISSION_KEYS, cleanAdminPermissions } from '@/utils/adminPermissions'

function describe (row) {
  if (!row.isAdmin) return { level: 'none', permissions: [] }
  if (!row.adminRestricted) return { level: 'full', permissions: [] }
  return { level: 'sub', permissions: cleanAdminPermissions(row.adminPermissions) }
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const caller = await getAdminScope(me.id)
  if (!caller?.scope?.full) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Full admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })
  if (id === me.id) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot change your own admin access' })
  }

  const body = (await readBody(event)) || {}
  const level = body.level
  if (level !== 'sub' && level !== 'none') {
    throw createError({ statusCode: 400, statusMessage: "level must be 'sub' or 'none'" })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, username: true, discordId: true, banned: true,
      isAdmin: true, adminRestricted: true, adminPermissions: true
    }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.discordId === SUPER_ADMIN_DISCORD_ID) {
    throw createError({ statusCode: 403, statusMessage: 'The super admin cannot be made a sub-admin' })
  }

  const before = describe(target)

  if (level === 'none') {
    if (before.level !== 'sub') {
      throw createError({
        statusCode: 400,
        statusMessage: before.level === 'full' ? 'Use Remove Admin to remove a full admin' : 'User is not a sub-admin'
      })
    }
    await prisma.user.update({
      where: { id },
      data: { isAdmin: false, adminRestricted: false, adminPermissions: [] }
    })
    invalidateAdminScope(id)
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'Admin:Users',
      key: 'removeSubAdmin',
      prevValue: before,
      newValue: { level: 'none', permissions: [] },
      targetUserId: target.id,
      targetUsername: target.username
    })
    return { ok: true, user: { id, isAdmin: false, adminRestricted: false, adminPermissions: [] } }
  }

  // level === 'sub'
  if (target.banned) {
    throw createError({ statusCode: 400, statusMessage: 'A banned user cannot be made an admin' })
  }
  if (before.level === 'full' && !caller.isSuperAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Only the super admin can change a full admin's access" })
  }

  const asked = Array.isArray(body.permissions) ? body.permissions : null
  if (!asked) throw createError({ statusCode: 400, statusMessage: 'permissions must be an array' })
  const unknown = asked.filter(k => !ADMIN_PERMISSION_KEYS.includes(k))
  if (unknown.length) {
    throw createError({ statusCode: 400, statusMessage: `Unknown or non-grantable tool: ${unknown.slice(0, 5).join(', ')}` })
  }
  const permissions = cleanAdminPermissions(asked)
  if (!permissions.length) {
    throw createError({ statusCode: 400, statusMessage: 'Enable at least one tool' })
  }

  await prisma.user.update({
    where: { id },
    data: { isAdmin: true, adminRestricted: true, adminPermissions: permissions }
  })
  invalidateAdminScope(id)

  const added = permissions.filter(k => !before.permissions.includes(k))
  const removed = before.permissions.filter(k => !permissions.includes(k))
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: before.level === 'sub' ? 'editSubAdminAccess' : before.level === 'full' ? 'convertToSubAdmin' : 'makeSubAdmin',
    prevValue: before,
    newValue: { level: 'sub', permissions, added, removed },
    targetUserId: target.id,
    targetUsername: target.username
  })

  return { ok: true, user: { id, isAdmin: true, adminRestricted: true, adminPermissions: permissions } }
})

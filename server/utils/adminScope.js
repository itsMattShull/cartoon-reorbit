// server/utils/adminScope.js
// Loads the calling user's admin scope (full admin vs sub-admin + granted tools) for
// server/middleware/require-admin-scope.js and admin-access.post.js.
//
// Cached per worker for a few seconds: the middleware runs on every /api/admin request, and a
// sub-admin's access changes rarely. The TTL is also the upper bound on how long a revoked
// permission keeps working on a worker other than the one that handled the revoke.
import { prisma as db } from '@/server/prisma'
import { adminScopeOf } from '@/utils/adminPermissions'
import { SUPER_ADMIN_DISCORD_ID } from '@/server/utils/adminAuth'

const TTL_MS = 10_000
const MAX_ENTRIES = 500
const cache = new Map() // userId -> { at, value }

/**
 * { isAdmin, banned, active, scope: { full, permissions }, isSuperAdmin } for a user id, or null
 * when the user does not exist. The super admin is always full, whatever the row says.
 */
export async function getAdminScope (userId) {
  if (!userId) return null
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const row = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, discordId: true, isAdmin: true, banned: true, active: true,
      adminRestricted: true, adminPermissions: true
    }
  })
  let value = null
  if (row) {
    const isSuperAdmin = row.discordId === SUPER_ADMIN_DISCORD_ID
    const scope = isSuperAdmin ? { full: true, permissions: [] } : adminScopeOf(row)
    value = { isAdmin: row.isAdmin, banned: row.banned, active: row.active, isSuperAdmin, scope }
  }
  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(userId, { at: Date.now(), value })
  return value
}

/** Drop a user's cached scope so this worker sees a change immediately. */
export function invalidateAdminScope (userId) {
  if (userId) cache.delete(userId)
}

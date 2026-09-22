// server/utils/adminAuth.js
// Home for the super-admin tier only. For an ordinary admin gate, use
// server/utils/requireAdmin.js — this file used to duplicate that helper's
// own requireAdmin() under the same export name, which the build's
// duplicate-import resolution silently collapsed to one or the other; the
// stricter helper below is the only thing that belongs here.
import { createError } from 'h3'
import { prisma as db } from '@/server/prisma'

// The one Discord account allowed to grant admin rights (see
// server/api/admin/users/[id]/make-admin.post.js) and, more broadly, the tier
// required for data sensitive enough that plain isAdmin shouldn't be enough on
// its own — currently the "Track Touch Trades" report, which surfaces other
// users' decrypted IP addresses and device info alongside full trade data.
export const SUPER_ADMIN_DISCORD_ID = '732319322093125695'

/**
 * Requires the one super-admin account. Stricter than requireAdmin — use for
 * endpoints that expose other users' IP addresses, device fingerprints, or
 * other data an ordinary promoted admin shouldn't see by default.
 *
 * Reads the session's own userId straight from the DB (same pattern as
 * server/utils/requireAdmin.js) rather than a self-loopback HTTP call, and
 * excludes a banned/deactivated account even if it still carries the
 * matching Discord id.
 */
export async function requireSuperAdmin(event) {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, discordId: true, banned: true, active: true }
  })
  if (!me || me.banned || me.active === false || me.discordId !== SUPER_ADMIN_DISCORD_ID) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Super admin only' })
  }
  return me
}

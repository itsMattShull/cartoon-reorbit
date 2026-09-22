// server/utils/adminAuth.js
// Shared admin-authorization helpers for server API routes.
import { getRequestHeader, createError } from 'h3'

// The one Discord account allowed to grant admin rights (see
// server/api/admin/users/[id]/make-admin.post.js) and, more broadly, the tier
// required for data sensitive enough that plain isAdmin shouldn't be enough on
// its own — currently the "Track Touch Trades" report, which surfaces other
// users' decrypted IP addresses and device info alongside full trade data.
export const SUPER_ADMIN_DISCORD_ID = '732319322093125695'

/**
 * Resolves the calling session's user via /api/auth/me, forwarding the
 * request's cookie. Throws 401 if there's no valid session.
 */
export async function requireSession(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    me = null
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return me
}

/** Requires an authenticated admin. Returns the session user. */
export async function requireAdminBySession(event) {
  const me = await requireSession(event)
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }
  return me
}

/**
 * Requires the one super-admin account. Stricter than requireAdmin — use for
 * endpoints that expose other users' IP addresses, device fingerprints, or
 * other data an ordinary promoted admin shouldn't see by default.
 */
export async function requireSuperAdmin(event) {
  const me = await requireSession(event)
  if (!me?.discordId || me.discordId !== SUPER_ADMIN_DISCORD_ID) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Super admin only' })
  }
  return me
}

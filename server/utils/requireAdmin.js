// server/utils/requireAdmin.js
//
// One admin gate for upload and config endpoints.
//
// The repo currently has two shapes of this check and the weaker one is the more common:
//
//   * The strong form (server/api/admin/fruitsamurai-image.post.js) reads the user straight
//     from the database off event.context.userId and refuses banned or deactivated admins.
//   * The weak form (winwheel-sound.post.js, game-tile-image.post.js, game-config.get.js and
//     others) does `$fetch('/api/auth/me', { headers: { cookie } })` and checks only `isAdmin`.
//     That has two problems: a suspended admin still passes, and it is a real loopback HTTP
//     request issued from inside a cluster worker on every call — a self-inflicted round trip
//     that gets worse exactly when the site is busy.
//
// Five hand-copied auth blocks is five chances to forget `banned`, so new endpoints use this.
import { createError } from 'h3'
import { prisma as db } from '@/server/prisma'

/**
 * Resolves the calling admin, or throws 401/403.
 *
 * Returns the row rather than a boolean because callers need `me.id` for logAdminChange.
 */
export async function requireAdmin(event) {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isAdmin: true, banned: true, active: true }
  })
  if (!me?.isAdmin || me.banned || me.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }
  return me
}

/**
 * Cheap CSRF defence in depth for state-changing admin endpoints.
 *
 * The session cookie is SameSite=Lax (server/api/auth/discord/callback.get.js), which already
 * blocks cross-site POST — but Lax DOES send on a top-level GET navigation, so the protection
 * evaporates the moment a mutating route is reachable by GET. This rejects an explicit
 * cross-site origin as a second line, and costs nothing.
 *
 * Same-origin requests from fetch/XHR send Sec-Fetch-Site: same-origin; navigations and older
 * browsers may send neither header, which is why a missing header is allowed rather than
 * refused.
 */
export function assertSameOrigin(event) {
  const site = event.node.req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') {
    throw createError({ statusCode: 403, statusMessage: 'Cross-site request refused' })
  }
}

// Shared admin guard for server/api/admin/** routes. Forwards the request's session cookie
// to /api/auth/me and throws 403 unless the caller is an admin. Existing admin routes each
// reimplement this inline (server/api/admin/czone-contest/*, winball-grand-prize.post.js) —
// new routes should use this instead so a dropped `.catch` or swapped status code can't
// silently open an admin endpoint in more than one place.
import { getRequestHeader, createError } from 'h3'

export async function requireAdmin(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  return me
}

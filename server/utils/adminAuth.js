// server/utils/adminAuth.js
// Shared admin-check for API handlers. Every admin endpoint in this codebase has so far
// hand-copied this same cookie -> /api/auth/me -> isAdmin check (see server/api/admin/cmoons.post.js,
// server/api/admin/cmoons/[id].put.js, etc.) — new endpoints should call this instead so the
// check can't be forgotten or drift. Returns the authenticated admin user; throws 401/403.
import { getRequestHeader, createError } from 'h3'

export async function requireAdmin(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  return me
}

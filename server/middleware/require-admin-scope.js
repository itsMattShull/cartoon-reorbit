// server/middleware/require-admin-scope.js
// Enforces sub-admin permissions on every admin API call.
//
// Individual /api/admin handlers still do their own "is this an admin" check; this runs before
// them and narrows a *restricted* admin (User.adminRestricted) to the tools they were granted,
// so none of the hundreds of handlers has to know about sub-admins. Full admins, non-admins and
// anonymous callers fall straight through to the handler's own check, unchanged.
//
// A path under /api/admin that utils/adminPermissions.js does not map is refused for a
// restricted admin, so a new endpoint is invisible to sub-admins until it is mapped.
//
// Not relying on server/middleware/auth.js having run first: that file sets
// event.context.userId, but middleware order is not something to depend on for a security
// check, so the session cookie is verified here too when the id is not set yet.
import { createError, getCookie } from 'h3'
import jwt from 'jsonwebtoken'
import { getAdminScope } from '@/server/utils/adminScope'
import { adminScopeDenial, isScopedAdminPath, normalizeAdminApiPath } from '@/utils/adminPermissions'

export default defineEventHandler(async (event) => {
  const rawPath = event.path || event.node?.req?.url || ''
  if (!isScopedAdminPath(normalizeAdminApiPath(rawPath))) return

  let userId = event.context.userId
  if (!userId) {
    const token = getCookie(event, 'session')
    if (!token) return // anonymous: the handler answers 401
    try {
      userId = jwt.verify(token, useRuntimeConfig(event).jwtSecret).sub
    } catch {
      return // invalid session: the handler answers 401
    }
  }

  const info = await getAdminScope(userId)
  if (!info?.isAdmin) return // not an admin: the handler's own check refuses
  if (info.scope.full) return

  const denial = adminScopeDenial(info.scope, rawPath, event.method)
  if (denial) throw createError({ statusCode: 403, statusMessage: denial })
})

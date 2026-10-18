// Refuses the high-risk admin routes to sub-admins (User.isSubAdmin) in ONE place, instead of
// editing the ~230 handlers that each hand-copy their own `isAdmin` check. The policy lives in
// utils/adminAccess.js.
//
// Nitro runs server middleware in filename order, so this runs after auth.js has put the session's
// user id on event.context.
import { createError } from 'h3'
import { prisma } from '@/server/prisma'
import { isApiDeniedForSubAdmin } from '@/utils/adminAccess'

export default defineEventHandler(async (event) => {
  // Cheap, DB-free checks first: almost every request is neither an admin route nor a denied one.
  if (!event.path.startsWith('/api/admin') && !event.path.startsWith('/api/discord')) return
  if (!isApiDeniedForSubAdmin(event.method, event.path)) return

  const userId = event.context.userId
  if (!userId) return // not logged in: the handler's own 401 applies

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isSubAdmin: true } })
  if (me?.isSubAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — not available to sub-admins' })
  }
})

// Custom Nitro error handler, registered ahead of Nuxt's default one via the
// nitro:config hook in nuxt.config.js. It never sends a response itself; it
// only mutates the error and falls through to Nuxt's handler.
//
// In production Nitro redacts unhandled/fatal errors to a generic
// "Server Error" message with no stack. For admins we clear those flags (and
// attach the stack via error.data, the only field that reaches the error
// page) so the error page shows full details. Non-admins keep the redacted
// output so nothing internal leaks.
import jwt from 'jsonwebtoken'
import { getCookie } from 'h3'
import { prisma } from './prisma.js'

export default async function errorDetailsHandler (error, event) {
  if (!error.unhandled && !error.fatal) return
  if (!(await isAdminRequest(event))) return

  // Keep the server-side log the default handler would otherwise emit
  console.error(`[request error] [unhandled] [${event.method}] ${event.path}\n`, error)

  error.unhandled = false
  error.fatal = false
  if (error.stack) {
    error.data = (error.data && typeof error.data === 'object')
      ? { ...error.data, stack: error.stack }
      : { stack: error.stack }
  }
}

async function isAdminRequest (event) {
  try {
    const token = getCookie(event, 'session')
    if (!token) return false
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (!payload?.sub) return false
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isAdmin: true }
    })
    return !!user?.isAdmin
  } catch {
    // Invalid token or DB unavailable — treat as non-admin
    return false
  }
}

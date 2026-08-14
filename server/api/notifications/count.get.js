// The badge's unread count. This is the only endpoint in the notification
// feature that gets polled, so it is the only one whose cost is multiplied by
// every logged-in user and every open tab.
//
// ── Why this one does not call /api/auth/me ──────────────────────────────────
// Every other handler in this codebase authenticates with
// `$fetch('/api/auth/me', { headers: { cookie } })`. That is an internal HTTP
// round trip which re-runs the whole middleware stack (guild-check's user
// lookup, daily-points' upsert AND interactive transaction, login-log's two
// queries) and then, inside me.get.js, does a user lookup plus two
// collection-wide userCtoon aggregates. Roughly twenty Postgres round trips and
// two interactive transactions, to return one integer that is 0 for most users
// most of the time. server/middleware/daily-points.js and
// server/utils/hotPaths.js both document that this pattern has already
// exhausted the connection pool once.
//
// So this handler reads `event.context.userId`, which server/middleware/auth.js
// has already established from the signed JWT at no DB cost, and is listed in
// HOT_PATHS so the per-request bookkeeping middleware skips it. That is safe for
// the reason hotPaths.js already gives: every page load still hits
// /api/auth/me, so the daily award, guild sync and login log still fire on the
// surrounding navigation.
//
// ── The catch that the cheap path would otherwise drop ───────────────────────
// Ban enforcement lives in /api/auth/me (it throws 403 for a banned user), so
// skipping it would leave banned accounts served by this route. Rather than pay
// for a second query to check, the ban is folded into the count itself as a
// relation filter — same single index-backed statement, no extra round trip.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const unreadCount = await db.notification.count({
    where: { userId, readAt: null, user: { banned: false } }
  })

  return { unreadCount }
})

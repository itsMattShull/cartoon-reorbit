// server/api/admin/users/[id]/suspend.post.js
//
// Temporary suspension: blocks login/play for a set window WITHOUT touching Discord membership
// or the `active`/`banned` flags that server/api/admin/users/[id]/ban.post.js owns — see that
// distinction documented on User.suspendedUntil in prisma/schema.prisma. Enforced centrally in
// server/api/auth/me.get.js (every page load) and server/api/auth/discord/callback.get.js
// (new logins), plus server/socket-server.js's connection auth.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const MIN_HOURS = 1
// A year — generous enough for any real case, but still a backstop against a typo (e.g. an
// admin meaning "7" days but entering "7" into a hours field) turning "temporary" into
// effectively permanent with none of the Discord/ban bookkeeping a real permanent ban gets.
const MAX_HOURS = 24 * 365

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  // 1) Params & body
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const reason = (body?.reason || '').trim()
  if (!reason || reason.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Reason must be at least 10 characters.' })
  }

  const durationHours = Number(body?.durationHours)
  if (!Number.isFinite(durationHours) || durationHours < MIN_HOURS || durationHours > MAX_HOURS) {
    throw createError({ statusCode: 400, statusMessage: `Duration must be between ${MIN_HOURS} and ${MAX_HOURS} hours.` })
  }

  // 2) Load target user
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, suspendedUntil: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Cannot suspend another admin' })

  // 3) Update
  const until = new Date(Date.now() + durationHours * 60 * 60 * 1000)
  const prev = { suspendedUntil: target.suspendedUntil }
  await prisma.user.update({
    where: { id: target.id },
    data: { suspendedUntil: until, suspendedReason: reason }
  })

  await prisma.userBanNote.create({
    data: {
      userId: target.id,
      adminId: me.id,
      action: 'SUSPEND',
      reason: `${reason}\n\n(Suspended ${durationHours}h — until ${until.toISOString()})`,
    }
  })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'suspendUser',
    prevValue: prev,
    newValue: { suspendedUntil: until, durationHours, reason }
  })

  return { ok: true, suspendedUntil: until }
})

// server/api/admin/cmoons/[id]/poll.delete.js
// Removes this cMoon's active poll (if any) without replacing it — cascades to its options/votes.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { invalidatePollResults } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id }, select: { id: true, poll: { select: { id: true } } } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
  if (!cmoon.poll) return { ok: true }

  await db.cMoonPoll.delete({ where: { id: cmoon.poll.id } })
  invalidatePollResults(cmoon.poll.id)

  await logAdminChange(db, { userId: me.id, area: `cMoon:${id}`, key: 'poll', prevValue: cmoon.poll.id, newValue: null })

  return { ok: true }
})

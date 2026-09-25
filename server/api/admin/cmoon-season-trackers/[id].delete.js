// server/api/admin/cmoon-season-trackers/[id].delete.js
// A tracker is a pure config row read fresh on every request (server/utils/cmoonSeason.js) —
// nothing else references it, so there is no usage guard here.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tracker = await db.cMoonSeasonTracker.findUnique({ where: { id } })
  if (!tracker) throw createError({ statusCode: 404, statusMessage: 'Season tracker not found' })

  await db.cMoonSeasonTracker.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'CMoonSeasonTracker', key: `delete:${id}`, prevValue: { label: tracker.label }, newValue: null })

  return { ok: true }
})

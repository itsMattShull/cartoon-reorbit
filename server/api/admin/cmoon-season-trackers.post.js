// server/api/admin/cmoon-season-trackers.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTrackerBody } from '@/server/utils/cmoonSeasonTracker'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseTrackerBody(body, undefined)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  const created = await db.cMoonSeasonTracker.create({ data: parsed.data })

  await logAdminChange(db, { userId: me.id, area: 'CMoonSeasonTracker', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, label: created.label, metricType: created.metricType, targetValue: created.targetValue } })

  return { id: created.id }
})

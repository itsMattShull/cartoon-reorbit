// server/api/admin/cmoon-season-trackers/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTrackerBody } from '@/server/utils/cmoonSeasonTracker'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tracker = await db.cMoonSeasonTracker.findUnique({ where: { id } })
  if (!tracker) throw createError({ statusCode: 404, statusMessage: 'Season tracker not found' })

  const body = await readBody(event)
  const parsed = parseTrackerBody(body, tracker)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  await db.cMoonSeasonTracker.update({ where: { id }, data: parsed.data })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonSeasonTracker',
    key: `update:${id}`,
    prevValue: { label: tracker.label, metricType: tracker.metricType, targetValue: tracker.targetValue, active: tracker.active },
    newValue: { label: parsed.data.label, metricType: parsed.data.metricType, targetValue: parsed.data.targetValue, active: parsed.data.active },
  })

  return { ok: true }
})

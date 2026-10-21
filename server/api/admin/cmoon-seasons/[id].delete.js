// server/api/admin/cmoon-seasons/[id].delete.js
// Deletes a season — only allowed while it hasn't started yet, same restriction as editing (see
// [id].put.js's own comment). Trackers cascade-delete via the schema's onDelete: Cascade.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const existing = await db.cMoonSeason.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Season not found' })
  if (existing.startAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Only a season that has not started yet can be deleted' })
  }

  await db.cMoonSeason.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'CMoonSeason', key: `delete:${id}`, prevValue: { seasonNumber: existing.seasonNumber, header: existing.header }, newValue: null })

  return { ok: true }
})

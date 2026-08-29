// server/api/admin/cmoons/[id]/affinity-levels/[levelId].delete.js — delete one affinity level.
// Mirrors ranks/[rankId].delete.js's held-by-members guard.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  const levelId = event.context.params?.levelId
  const level = await db.cMoonAffinityLevel.findUnique({ where: { id: levelId } })
  if (!level || level.cMoonId !== cMoonId) throw createError({ statusCode: 404, statusMessage: 'Affinity level not found' })

  const holderCount = await db.cMoonAffinity.count({ where: { currentLevelId: levelId } })
  if (holderCount > 0) {
    throw createError({ statusCode: 409, statusMessage: `Cannot delete — ${holderCount} member(s) currently hold this level.` })
  }

  await db.cMoonAffinityLevel.delete({ where: { id: levelId } })
  await logAdminChange(db, { userId: me.id, area: 'CMoonAffinityLevel', key: `delete:${levelId}`, prevValue: { name: level.name, threshold: level.threshold }, newValue: null })

  return { ok: true }
})

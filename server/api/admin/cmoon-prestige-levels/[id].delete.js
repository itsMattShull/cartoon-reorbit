// server/api/admin/cmoon-prestige-levels/[id].delete.js — remove a prestige ladder rung. Safe to
// delete freely: a CMoonPrestigeLevel is read live at the moment a player tries to prestige
// (see findNextPrestigeLevel in server/utils/cmoonPrestige.js) and CMoonPrestigeLog only ever
// stores a plain `level` scalar snapshot, never an FK to this row — deleting one simply makes
// that level number "not configured yet" again for anyone who hasn't reached it.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const level = await db.cMoonPrestigeLevel.findUnique({ where: { id } })
  if (!level) throw createError({ statusCode: 404, statusMessage: 'Prestige level not found' })

  await db.cMoonPrestigeLevel.delete({ where: { id } })
  await logAdminChange(db, { userId: me.id, area: 'CMoonPrestigeLevel', key: `delete:${id}`, prevValue: { level: level.level, pointThreshold: level.pointThreshold }, newValue: null })

  return { ok: true }
})

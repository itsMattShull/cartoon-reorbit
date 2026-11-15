// server/api/admin/cmoon-enemy-maps/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseEnemyMapBody } from '@/server/utils/cmoonEnemyMap'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const map = await db.cMoonEnemyMap.findUnique({ where: { id } })
  if (!map) throw createError({ statusCode: 404, statusMessage: 'Map not found' })

  const body = await readBody(event)
  const parsed = parseEnemyMapBody(body, map)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  // The seeded base map ("No Effect") is editable ONLY for its own occurrenceWeight — every
  // other field (name, animation, color, effects, active, assignedEnemiesOnly) is locked to
  // what it shipped with, since it's meant to stay the one guaranteed-neutral entry in the
  // random pool. See CMoonEnemyMap.isBaseMap's own schema comment.
  const data = map.isBaseMap ? { occurrenceWeight: parsed.data.occurrenceWeight } : parsed.data

  try {
    await db.cMoonEnemyMap.update({ where: { id }, data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A map with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyMap', key: `update:${id}`, prevValue: { name: map.name }, newValue: { name: data.name || map.name } })

  return { ok: true }
})

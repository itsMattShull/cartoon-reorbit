// server/api/admin/cmoon-enemy-maps/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const map = await db.cMoonEnemyMap.findUnique({ where: { id } })
  if (!map) throw createError({ statusCode: 404, statusMessage: 'Map not found' })

  // The seeded base map is the one guaranteed-neutral entry the random pool always has — see
  // CMoonEnemyMap.isBaseMap's own schema comment on why a fresh install needs it to exist.
  if (map.isBaseMap) {
    throw createError({ statusCode: 409, statusMessage: 'The base "No Effect" map cannot be deleted' })
  }

  // No pre-check needed for in-use factions/members the way cmoon-special-attacks' own delete
  // does — CMoonEnemyFaction.defaultMapId/CMoonEnemyMember.overrideMapId are both onDelete:
  // SetNull (not Restrict), since a map carries no history worth blocking a delete over; any
  // raid/match that already resolved with this map keeps its own mapId pointing here until this
  // row itself is gone (also SetNull), same low-stakes stance CMoon.cMoonId's own SetNull takes.
  await db.cMoonEnemyMap.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyMap', key: `delete:${id}`, prevValue: { name: map.name }, newValue: null })

  return { ok: true }
})

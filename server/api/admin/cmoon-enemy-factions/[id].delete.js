// server/api/admin/cmoon-enemy-factions/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const faction = await db.cMoonEnemyFaction.findUnique({ where: { id }, include: { _count: { select: { members: true } } } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

  // Blocked while it has ANY members, battle history or not. The member FK is onDelete: Cascade
  // (see CMoonEnemyMember.faction in prisma/schema.prisma), so the DB alone would happily take the
  // members down with the faction — except that any member with battle history is itself
  // Restrict-blocked by CMoonEnemyBattle.enemyMember, which would fail the whole delete partway
  // through a cascade with a confusing error. One simple rule instead: empty the faction first
  // (delete members that were never fought, deactivate or move the rest).
  if (faction._count?.members > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete — this faction still has ${faction._count.members} enemy member(s). Delete or move them to another faction first.`,
    })
  }

  try {
    await db.cMoonEnemyFaction.delete({ where: { id } })
  } catch (err) {
    // Backstop for the narrow race where a member was added between the check above and this
    // delete: a never-fought member would cascade away with it, but a fought one trips its
    // battles' Restrict FK here — same P2003 catch as server/api/admin/czone-effects/[id].delete.js.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — this faction has an enemy member with battle history. Move or deactivate it first.' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyFaction', key: `delete:${id}`, prevValue: { name: faction.name }, newValue: null })

  if (faction.bannerImagePath) {
    const filename = faction.bannerImagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoon-enemy-factions', filename)) } catch {} }
  }

  return { ok: true }
})

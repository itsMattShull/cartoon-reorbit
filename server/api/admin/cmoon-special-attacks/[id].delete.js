// server/api/admin/cmoon-special-attacks/[id].delete.js
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
  const attack = await db.cMoonSpecialAttack.findUnique({
    where: { id },
    include: { _count: { select: { cmoons: true, enemyFactions: true } } },
  })
  if (!attack) throw createError({ statusCode: 404, statusMessage: 'Special attack not found' })

  // Friendly pre-check message; the FKs' ON DELETE RESTRICT (see CMoon.specialAttack and
  // CMoonEnemyFaction.specialAttack in prisma/schema.prisma) are the real race-proof backstop
  // below, same pattern as cmoon-join-effects/[id].delete.js's own P2003 catch.
  if (attack._count?.cmoons > 0 || attack._count?.enemyFactions > 0) {
    const parts = []
    if (attack._count.cmoons > 0) parts.push(`${attack._count.cmoons} cMoon(s)`)
    if (attack._count.enemyFactions > 0) parts.push(`${attack._count.enemyFactions} enemy faction(s)`)
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete — this attack is assigned to ${parts.join(' and ')}. Reassign them first.`,
    })
  }

  try {
    await db.cMoonSpecialAttack.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — this attack is still assigned to a cMoon or enemy faction. Reassign it first.' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonSpecialAttack', key: `delete:${id}`, prevValue: { name: attack.name }, newValue: null })

  if (attack.soundPath) {
    const filename = attack.soundPath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoon-special-attacks', filename)) } catch {} }
  }

  return { ok: true }
})

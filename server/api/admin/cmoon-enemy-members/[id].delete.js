// server/api/admin/cmoon-enemy-members/[id].delete.js
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
  const member = await db.cMoonEnemyMember.findUnique({ where: { id }, include: { _count: { select: { battles: true } } } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  // Friendly pre-check message; the FK's ON DELETE RESTRICT (see CMoonEnemyBattle.enemyMember in
  // prisma/schema.prisma — the battle log is a permanent audit trail) is the real race-proof
  // backstop below, same pattern as server/api/admin/czone-effects/[id].delete.js's own P2003
  // catch. Reward rows are NOT a blocker: CMoonEnemyReward.enemyMember is onDelete: Cascade, so
  // a never-fought member's prize table goes with it, intentionally.
  if (member._count?.battles > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete — this enemy has battle history (${member._count.battles} battle(s)). Deactivate it instead of deleting.`,
    })
  }

  try {
    await db.cMoonEnemyMember.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — this enemy has battle history. Deactivate it instead of deleting.' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyMember', key: `delete:${id}`, prevValue: { factionId: member.factionId, name: member.name }, newValue: null })

  if (member.imagePath) {
    const filename = member.imagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoon-enemy-members', filename)) } catch {} }
  }

  return { ok: true }
})

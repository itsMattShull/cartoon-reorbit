// server/api/admin/cmoon-enemy-wind-up-moves/[id].delete.js — remove ONE wind-up/telegraph move
// (the "remove" half of the add/remove pair in cmoon-enemy-members/[id]/wind-up-moves.post.js).
// No usage guard, same reasoning as cmoon-enemy-rewards/[id].delete.js: nothing references a
// move row — a round's roll just reads whichever rows currently exist, nothing is snapshotted
// back to one by id.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const move = await db.cMoonEnemyWindUpMove.findUnique({ where: { id } })
  if (!move) throw createError({ statusCode: 404, statusMessage: 'Wind-up move not found' })

  try {
    await db.cMoonEnemyWindUpMove.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Wind-up move not found' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyWindUpMove',
    key: `delete:${id}`,
    prevValue: {
      enemyMemberId: move.enemyMemberId,
      telegraphMessage: move.telegraphMessage,
      direction: move.direction,
      occurrencePercent: move.occurrencePercent,
      bonusType: move.bonusType,
      bonusAmount: move.bonusAmount,
    },
    newValue: null,
  })

  return { ok: true }
})

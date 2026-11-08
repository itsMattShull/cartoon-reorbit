// server/api/admin/cmoon-enemy-member-special-attacks/[id].delete.js — remove ONE override row
// (the "remove" half of the add/remove pair in cmoon-enemy-members/[id]/special-attacks.post.js).
// No usage guard beyond the row itself: nothing references it directly — a fired attack's name/
// effect/amount is read live off CMoonSpecialAttack through this join at the moment it fires,
// never snapshotted onto this row — so it's a pure leaf config row, same as cmoon-enemy-rewards.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const row = await db.cMoonEnemyMemberSpecialAttack.findUnique({ where: { id } })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Enemy special attack not found' })

  try {
    await db.cMoonEnemyMemberSpecialAttack.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Enemy special attack not found' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMemberSpecialAttack',
    key: `delete:${id}`,
    prevValue: { enemyMemberId: row.enemyMemberId, specialAttackId: row.specialAttackId, usePercent: row.usePercent },
    newValue: null,
  })

  return { ok: true }
})

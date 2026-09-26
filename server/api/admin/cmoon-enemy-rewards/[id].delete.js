// server/api/admin/cmoon-enemy-rewards/[id].delete.js — remove ONE prize row from an enemy
// member's reward table (the "remove" half of the add/remove pair described in
// cmoon-enemy-members/[id]/rewards.post.js). No usage guard: nothing references a reward row —
// a win's granted prizes are snapshotted into CMoonEnemyBattle.rewardsGranted as display-only
// JSON, not linked back here — so it's a pure leaf config row.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const reward = await db.cMoonEnemyReward.findUnique({ where: { id } })
  if (!reward) throw createError({ statusCode: 404, statusMessage: 'Enemy reward not found' })

  try {
    await db.cMoonEnemyReward.delete({ where: { id } })
  } catch (err) {
    // Already gone (another admin request, or its member was deleted and cascaded it) — the
    // end state the caller asked for, but report it the same way the lookup above would.
    if (err?.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Enemy reward not found' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyReward',
    key: `delete:${id}`,
    prevValue: {
      enemyMemberId: reward.enemyMemberId,
      rewardType: reward.rewardType,
      ctoonId: reward.ctoonId,
      avatarId: reward.avatarId,
      backgroundId: reward.backgroundId,
      dropChancePercent: reward.dropChancePercent,
      quantity: reward.quantity,
    },
    newValue: null,
  })

  return { ok: true }
})

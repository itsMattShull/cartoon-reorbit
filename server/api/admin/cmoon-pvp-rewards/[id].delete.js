// server/api/admin/cmoon-pvp-rewards/[id].delete.js — remove ONE prize row (the "remove" half of
// the add/remove pair in index.post.js). No usage guard, same reasoning as
// cmoon-enemy-rewards/[id].delete.js: a granted prize is snapshotted into
// CMoonPvpParticipant.rewardsGranted as display-only JSON, never linked back here.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const reward = await db.cMoonPvpReward.findUnique({ where: { id } })
  if (!reward) throw createError({ statusCode: 404, statusMessage: 'PvP reward not found' })

  try {
    await db.cMoonPvpReward.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'PvP reward not found' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonPvpReward',
    key: `delete:${id}`,
    prevValue: {
      context: reward.context, rewardType: reward.rewardType,
      ctoonId: reward.ctoonId, avatarId: reward.avatarId, backgroundId: reward.backgroundId, packId: reward.packId,
      dropChancePercent: reward.dropChancePercent, quantity: reward.quantity,
    },
    newValue: null,
  })

  return { ok: true }
})

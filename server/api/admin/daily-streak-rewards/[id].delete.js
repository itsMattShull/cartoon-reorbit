// server/api/admin/daily-streak-rewards/[id].delete.js — remove ONE reward row (the "remove"
// half of the add/remove pair in index.post.js). No usage guard: a day a player already passed
// keeps its grant on record via DailyStreakClaim/the reward objects it actually produced
// (PointsLog/UserPack/UserCtoon/CMoonScoreLog rows), never linked back to this row, same
// reasoning cmoon-pvp-rewards/[id].delete.js's own comment gives for CMoonPvpReward.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const reward = await db.dailyStreakReward.findUnique({ where: { id } })
  if (!reward) throw createError({ statusCode: 404, statusMessage: 'Daily Streak reward not found' })

  try {
    await db.dailyStreakReward.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Daily Streak reward not found' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'DailyStreakReward',
    key: `delete:${id}`,
    prevValue: {
      day: reward.day, rewardType: reward.rewardType,
      ctoonId: reward.ctoonId, packId: reward.packId, amount: reward.amount
    },
    newValue: null
  })

  return { ok: true }
})

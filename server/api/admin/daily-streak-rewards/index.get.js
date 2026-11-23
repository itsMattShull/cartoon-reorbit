// server/api/admin/daily-streak-rewards/index.get.js — list every configured Daily Streak
// reward row, across every milestone day. Like CMoonPvpReward, a row has no owning parent
// resource (it's keyed by `day` alone), so this is its own standalone listing endpoint.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const rows = await db.dailyStreakReward.findMany({
    orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
    include: {
      ctoon: { select: { id: true, name: true, assetPath: true } },
      pack: { select: { id: true, name: true, imagePath: true } }
    }
  })
  return { rewards: rows }
})

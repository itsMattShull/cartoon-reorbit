// server/api/admin/cmoon-pvp-rewards/index.get.js — list every configured cMoon PvP reward row,
// across all four contexts (see CMoonPvpRewardContext's own schema comment). Unlike
// CMoonEnemyReward (nested under one enemy member's own GET), a PvP reward has no owning parent
// resource — it's keyed by `context` alone — so this is its own standalone listing endpoint.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const rows = await db.cMoonPvpReward.findMany({
    orderBy: [{ context: 'asc' }, { createdAt: 'asc' }],
    include: {
      ctoon: { select: { id: true, name: true, assetPath: true } },
      avatar: { select: { id: true, label: true, imagePath: true } },
      background: { select: { id: true, label: true, imagePath: true } },
      pack: { select: { id: true, name: true, imagePath: true } },
    },
  })
  return { rewards: rows }
})

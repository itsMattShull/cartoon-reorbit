// server/api/admin/cmoon-prestige-rank-tiers.get.js — list the admin-defined prestige-exclusive
// rank ladder (see prisma/schema.prisma's CMoonPrestigeRankTier comment).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tiers = await db.cMoonPrestigeRankTier.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      ctoon: { select: { name: true, assetPath: true } },
      avatar: { select: { label: true } },
      background: { select: { label: true } },
      pack: { select: { name: true } },
      _count: { select: { ranks: true } },
    },
  })

  return {
    tiers: tiers.map(t => ({
      id: t.id,
      name: t.name,
      sortOrder: t.sortOrder,
      pointThreshold: t.pointThreshold,
      rewardType: t.rewardType,
      ctoonId: t.ctoonId,
      avatarId: t.avatarId,
      backgroundId: t.backgroundId,
      packId: t.packId,
      quantity: t.quantity,
      ctoon: t.ctoon,
      avatar: t.avatar,
      background: t.background,
      pack: t.pack,
      // How many prestige cMoons currently mirror this tier — purely informational (lets the
      // admin see at a glance whether any prestige cMoon exists yet to apply it to).
      prestigeCMoonCount: t._count.ranks,
    })),
  }
})

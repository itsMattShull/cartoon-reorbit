// server/api/admin/cmoon-rank-tiers.get.js — list the universal rank ladder (one flat list,
// shared by every cMoon — see prisma/schema.prisma's CMoonRankTier comment).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tiers = await db.cMoonRankTier.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      rewardCtoons: {
        orderBy: { sortOrder: 'asc' },
        include: { ctoon: { select: { id: true, name: true, assetPath: true } } },
      },
    },
  })

  return {
    tiers: tiers.map(t => ({
      id: t.id,
      name: t.name,
      sortOrder: t.sortOrder,
      pointThreshold: t.pointThreshold,
      rewardCtoons: t.rewardCtoons.map(r => ({
        ctoonId: r.ctoonId,
        name: r.ctoon?.name || '',
        assetPath: r.ctoon?.assetPath || null,
      })),
    })),
  }
})

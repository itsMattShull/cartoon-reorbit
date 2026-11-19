import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const furniture = await db.myOrbitFurniture.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { placements: true } } }
  })

  return {
    furniture: furniture.map(f => ({
      id: f.id,
      name: f.name,
      assetPath: f.assetPath,
      footprintW: f.footprintW,
      footprintH: f.footprintH,
      blocksWalk: f.blocksWalk,
      zOffset: f.zOffset,
      sittable: f.sittable,
      placementCount: f._count.placements
    }))
  }
})

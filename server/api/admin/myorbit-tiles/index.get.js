import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tiles = await db.myOrbitTile.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { placements: true } } }
  })

  return {
    tiles: tiles.map(t => ({
      id: t.id,
      name: t.name,
      assetPath: t.assetPath,
      walkable: t.walkable,
      placementCount: t._count.placements
    }))
  }
})

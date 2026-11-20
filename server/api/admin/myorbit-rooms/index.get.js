// Lightweight list - no tiles/furniture included, since a room's full layout can be hundreds of
// rows. See [id].get.js for the full layout a single room's builder view actually needs.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [rooms, config] = await Promise.all([
    db.myOrbitRoom.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { tiles: true, furniture: true } } }
    }),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { myOrbitEnabled: true } })
  ])

  return {
    myOrbitEnabled: !!config?.myOrbitEnabled,
    rooms: rooms.map(r => ({
      id: r.id,
      name: r.name,
      gridWidth: r.gridWidth,
      gridHeight: r.gridHeight,
      capacity: r.capacity,
      active: r.active,
      sortOrder: r.sortOrder,
      themeCMoonId: r.themeCMoonId,
      isRaidDen: r.isRaidDen,
      showLeaderboard: r.showLeaderboard,
      tileCount: r._count.tiles,
      furnitureCount: r._count.furniture
    }))
  }
})

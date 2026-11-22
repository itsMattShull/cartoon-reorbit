// The builder's "load a room" endpoint - unlike index.get.js, this includes the full painted
// layout and placed furniture, joined with each piece's own art/footprint so the client never
// has to do its own N+1 lookups against the tile/furniture libraries to render what's here.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  const room = await db.myOrbitRoom.findUnique({
    where: { id },
    include: {
      tiles: { include: { tile: true } },
      furniture: { include: { furniture: true } }
    }
  })
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room not found' })

  return {
    id: room.id,
    name: room.name,
    gridWidth: room.gridWidth,
    gridHeight: room.gridHeight,
    capacity: room.capacity,
    active: room.active,
    sortOrder: room.sortOrder,
    ambientSoundPath: room.ambientSoundPath,
    themeCMoonId: room.themeCMoonId,
    isRaidDen: room.isRaidDen,
    showLeaderboard: room.showLeaderboard,
    tiles: room.tiles.map(t => ({
      x: t.x, y: t.y, tileId: t.tileId,
      assetPath: t.tile.assetPath, walkable: t.tile.walkable
    })),
    furniture: room.furniture.map(f => ({
      id: f.id, furnitureId: f.furnitureId, x: f.x, y: f.y, rotation: f.rotation,
      assetPath: f.furniture.assetPath, footprintW: f.furniture.footprintW, footprintH: f.furniture.footprintH,
      blocksWalk: f.furniture.blocksWalk, zOffset: f.furniture.zOffset, sittable: f.furniture.sittable
    }))
  }
})

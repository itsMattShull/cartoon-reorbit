// Replaces a room's ENTIRE furniture placement layout in one call - same "send the full current
// state, not a diff" shape as tiles.put.js. Validates against the room's CURRENTLY PERSISTED
// tiles (read fresh here, not from this request's own body), so painting new floor and saving
// it via tiles.put.js FIRST is required before furniture can stand on those new cells in the
// same editing session.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitRoomFurniturePlacements } from '@/server/utils/myOrbitRoom'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const room = await db.myOrbitRoom.findUnique({ where: { id } })
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room not found' })

  const paintedTiles = await db.myOrbitRoomTile.findMany({ where: { roomId: id }, select: { x: true, y: true } })
  const paintedCells = new Set(paintedTiles.map(t => `${t.x},${t.y}`))

  const body = await readBody(event)

  // Footprint dimensions are read fresh from the REAL library rows, never trusted from the
  // request body - see parseMyOrbitRoomFurniturePlacements's own header comment for why.
  const requestedIds = [...new Set((Array.isArray(body?.placements) ? body.placements : [])
    .map(p => p?.furnitureId).filter(id => typeof id === 'string' && id))]
  const furnitureRows = requestedIds.length
    ? await db.myOrbitFurniture.findMany({ where: { id: { in: requestedIds } }, select: { id: true, footprintW: true, footprintH: true } })
    : []
  const furnitureById = new Map(furnitureRows.map(f => [f.id, { footprintW: f.footprintW, footprintH: f.footprintH }]))

  const parsed = parseMyOrbitRoomFurniturePlacements(body, room, paintedCells, furnitureById)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  try {
    await db.$transaction([
      db.myOrbitRoomFurniture.deleteMany({ where: { roomId: id } }),
      ...(parsed.data.length
        ? [db.myOrbitRoomFurniture.createMany({ data: parsed.data.map(p => ({ roomId: id, ...p })) })]
        : [])
    ])
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 400, statusMessage: 'One or more placements reference furniture that no longer exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitRoom', key: `furniture:${id}`,
    prevValue: null, newValue: { placementCount: parsed.data.length }
  })

  return { ok: true, placementCount: parsed.data.length }
})

// Replaces a room's ENTIRE painted floor layout in one call - the builder always saves its
// whole current cell set rather than diffing, same "send the full current state" shape as
// server/api/czone/save.post.js's own layoutData write. Must be saved BEFORE furniture.put.js
// in the same session if any newly-placed furniture depends on newly-painted cells underneath
// it - see parseMyOrbitRoomFurniturePlacements's own header comment.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitRoomTiles } from '@/server/utils/myOrbitRoom'
import { effectiveFootprint } from '@/utils/myOrbitIsometric'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const room = await db.myOrbitRoom.findUnique({ where: { id } })
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room not found' })

  // Read fresh, authoritative footprints for whatever furniture is already placed here, so a
  // floor repaint can never strand a piece that's standing on a cell this save removes - see
  // parseMyOrbitRoomTiles's own header comment.
  const existingFurniture = await db.myOrbitRoomFurniture.findMany({
    where: { roomId: id },
    select: { x: true, y: true, rotation: true, furniture: { select: { footprintW: true, footprintH: true } } }
  })
  const existingFurnitureFootprints = existingFurniture.map(f => {
    const { width, height } = effectiveFootprint(f.furniture.footprintW, f.furniture.footprintH, f.rotation)
    return { x: f.x, y: f.y, width, height }
  })

  const body = await readBody(event)
  const parsed = parseMyOrbitRoomTiles(body, room, existingFurnitureFootprints)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  try {
    await db.$transaction([
      db.myOrbitRoomTile.deleteMany({ where: { roomId: id } }),
      ...(parsed.data.length
        ? [db.myOrbitRoomTile.createMany({ data: parsed.data.map(c => ({ roomId: id, ...c })) })]
        : [])
    ])
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 400, statusMessage: 'One or more cells reference a tile that no longer exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitRoom', key: `tiles:${id}`,
    prevValue: null, newValue: { cellCount: parsed.data.length }
  })

  return { ok: true, cellCount: parsed.data.length }
})

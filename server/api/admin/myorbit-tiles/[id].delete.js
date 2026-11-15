// server/api/admin/myorbit-tiles/[id].delete.js
// MyOrbitRoomTile.tileId is onDelete: Restrict (prisma/schema.prisma) - a tile currently painted
// into any room's grid can't be deleted out from under it. That constraint violation (P2003)
// is caught here and turned into a clear 409 rather than a raw DB error reaching the admin.
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'

const FEATURE = 'myorbit-tiles'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const tile = await db.myOrbitTile.findUnique({
    where: { id },
    include: { _count: { select: { placements: true } } }
  })
  if (!tile) throw createError({ statusCode: 404, statusMessage: 'Tile not found' })

  try {
    await db.myOrbitTile.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({
        statusCode: 409,
        statusMessage: `This tile is painted into ${tile._count.placements} room cell(s) — remove it from every room before deleting it.`
      })
    }
    throw err
  }

  if (tile.assetPath) {
    const filename = tile.assetPath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath(FEATURE, filename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitTile', key: `delete:${id}`,
    prevValue: { name: tile.name }, newValue: null
  })

  return { ok: true }
})

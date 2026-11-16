// server/api/admin/myorbit-furniture/[id].delete.js
// MyOrbitRoomFurniture.furnitureId is onDelete: Restrict - same reasoning as
// myorbit-tiles/[id].delete.js.
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'

const FEATURE = 'myorbit-furniture'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const furniture = await db.myOrbitFurniture.findUnique({
    where: { id },
    include: { _count: { select: { placements: true } } }
  })
  if (!furniture) throw createError({ statusCode: 404, statusMessage: 'Furniture not found' })

  try {
    await db.myOrbitFurniture.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({
        statusCode: 409,
        statusMessage: `This furniture is placed in ${furniture._count.placements} room(s) — remove it from every room before deleting it.`
      })
    }
    throw err
  }

  if (furniture.assetPath) {
    const filename = furniture.assetPath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath(FEATURE, filename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitFurniture', key: `delete:${id}`,
    prevValue: { name: furniture.name }, newValue: null
  })

  return { ok: true }
})

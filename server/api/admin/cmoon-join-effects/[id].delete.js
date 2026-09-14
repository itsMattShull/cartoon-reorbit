// server/api/admin/cmoon-join-effects/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const effect = await db.cMoonJoinEffect.findUnique({ where: { id }, include: { _count: { select: { cmoons: true } } } })
  if (!effect) throw createError({ statusCode: 404, statusMessage: 'Join effect not found' })

  // Friendly pre-check message; the FK's ON DELETE RESTRICT (see CMoon.customJoinEffect in
  // prisma/schema.prisma) is the real race-proof backstop below, same pattern as
  // server/api/admin/cmoons/[id].delete.js's own P2003 catch.
  if (effect._count?.cmoons > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete — this effect is assigned to ${effect._count.cmoons} cMoon(s). Reassign them first.`,
    })
  }

  try {
    await db.cMoonJoinEffect.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — this effect is still assigned to a cMoon. Reassign it first.' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonJoinEffect', key: `delete:${id}`, prevValue: { name: effect.name }, newValue: null })

  if (effect.imagePath) {
    const filename = effect.imagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoon-join-effects', filename)) } catch {} }
  }

  return { ok: true }
})

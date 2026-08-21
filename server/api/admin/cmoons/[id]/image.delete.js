// server/api/admin/cmoons/[id]/image.delete.js
// Removes a cMoon's poster art, reverting the picker back to its color-swatch fallback.
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
  if (!cmoon.imagePath) return { id, imagePath: null }

  const oldImagePath = cmoon.imagePath
  await db.cMoon.update({ where: { id }, data: { imagePath: null } })
  invalidateCMoonList()

  const oldFilename = oldImagePath.split('/').pop()
  if (oldFilename) { try { await unlink(uploadFsPath('cmoons', oldFilename)) } catch {} }

  await logAdminChange(db, {
    userId: me.id, area: 'cMoon', key: `image:${id}`, prevValue: oldImagePath, newValue: null,
  })

  return { id, imagePath: null }
})

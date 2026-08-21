// server/api/admin/cmoons/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { uploadFsPath } from '@/server/utils/uploadStorage'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  if (cmoon.memberCount > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot delete a cMoon that still has members — reassign them first' })
  }

  await db.cMoon.delete({ where: { id } })
  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `delete:${id}`, prevValue: { name: cmoon.name }, newValue: null })
  invalidateCMoonList()

  // Best-effort: an orphaned poster costs nothing to leave behind, but there's no reason not
  // to clean it up now that the row (and any stale cache pointing at it) is gone.
  if (cmoon.imagePath) {
    const filename = cmoon.imagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoons', filename)) } catch {} }
  }

  return { ok: true }
})

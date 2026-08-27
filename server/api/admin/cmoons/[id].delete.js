// server/api/admin/cmoons/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { cmoonPageFsPath, cmoonButtonFsPath, cmoonPageBannerFsPath } from '@/server/utils/cmoonImageStorage'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  if (cmoon.memberCount > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot delete a cMoon that still has members — reassign them first' })
  }
  // Display-assigned cToons (Ctoon.cMoonId) are NOT a delete-blocker like
  // members are — that relation is `onDelete: SetNull`, so deleting a cMoon
  // here just reverts those cToons' modals to the default (unthemed) look,
  // which is a low-stakes, reversible outcome unlike losing faction members.

  try {
    await db.cMoon.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — one of this cMoon\'s ranks is still referenced by an achievement. Reassign or delete that achievement\'s rank reward first.' })
    }
    throw err
  }
  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `delete:${id}`, prevValue: { name: cmoon.name }, newValue: null })
  invalidateCMoonList()

  // Best-effort: an orphaned file costs nothing to leave behind, but there's no reason not
  // to clean it up now that the row (and any stale cache pointing at it) is gone.
  if (cmoon.imagePath) {
    const filename = cmoon.imagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoons', filename)) } catch {} }
  }
  if (cmoon.pageImagePath) {
    const filename = cmoon.pageImagePath.split('/').pop()
    if (filename) { try { await unlink(cmoonPageFsPath(filename)) } catch {} }
  }
  if (cmoon.buttonImagePath) {
    const filename = cmoon.buttonImagePath.split('/').pop()
    if (filename) { try { await unlink(cmoonButtonFsPath(filename)) } catch {} }
  }
  if (cmoon.pageBannerImagePath) {
    const filename = cmoon.pageBannerImagePath.split('/').pop()
    if (filename) { try { await unlink(cmoonPageBannerFsPath(filename)) } catch {} }
  }

  return { ok: true }
})

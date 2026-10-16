// server/api/admin/flash-games/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'

const FEATURE = 'flash-games'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const existing = await db.flashGame.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Flash game not found' })

  await db.flashGame.delete({ where: { id } })

  for (const path of [existing.swfPath, existing.thumbnailPath]) {
    if (!path) continue
    const filename = path.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath(FEATURE, filename)) } catch {} }
  }

  await logAdminChange(db, { userId: me.id, area: `FlashGame:${id}`, key: 'delete', prevValue: { title: existing.title }, newValue: null })

  return { ok: true }
})

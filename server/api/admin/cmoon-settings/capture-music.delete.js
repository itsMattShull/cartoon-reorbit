// server/api/admin/cmoon-settings/capture-music.delete.js
// Clears cMoonEnemyCaptureMusicPath back to null — a capture then plays no music. Filed under
// cmoon-settings rather than global-config for the same permission-scoping reason as this
// segment's own .post.js — see that file's header comment.
import { defineEventHandler } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-settings'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', cMoonEnemyCaptureMusicPath: null },
    update: { cMoonEnemyCaptureMusicPath: null },
  })

  const oldPath = before?.cMoonEnemyCaptureMusicPath
  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'cMoonEnemyCaptureMusicPath',
      prevValue: oldPath ?? null,
      newValue: null,
    })
  } catch {}

  return { cMoonEnemyCaptureMusicPath: null }
})

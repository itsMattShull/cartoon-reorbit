// server/api/admin/cmoon-enemy-taunts/[id].delete.js — remove ONE taunt (the "remove" half of the
// add/remove pair described in cmoon-enemy-factions/[id]/taunts.post.js). Unlike
// cmoon-enemy-rewards/[id].delete.js's "pure leaf config row" (nothing else references a reward),
// a taunt can carry an uploaded sound file on disk, so this also unlinks it — same best-effort
// cleanup discipline the sound-upload endpoints use when replacing an old file.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { unlink } from 'node:fs/promises'

const FEATURE = 'cmoon-enemy-taunts'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const taunt = await db.cMoonEnemyTaunt.findUnique({ where: { id } })
  if (!taunt) throw createError({ statusCode: 404, statusMessage: 'Taunt not found' })

  try {
    await db.cMoonEnemyTaunt.delete({ where: { id } })
  } catch (err) {
    // Already gone (another admin request, or its faction was deleted and cascaded it) — the end
    // state the caller asked for, but report it the same way the lookup above would.
    if (err?.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Taunt not found' })
    }
    throw err
  }

  if (taunt.soundPath) {
    const filename = taunt.soundPath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath(FEATURE, filename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyTaunt',
    key: `delete:${id}`,
    prevValue: {
      factionId: taunt.factionId,
      trigger: taunt.trigger,
      text: taunt.text,
      soundPath: taunt.soundPath,
      active: taunt.active,
      sortOrder: taunt.sortOrder,
    },
    newValue: null,
  })

  return { ok: true }
})

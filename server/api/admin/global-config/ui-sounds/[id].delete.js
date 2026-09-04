// server/api/admin/global-config/ui-sounds/[id].delete.js
//
// Deletes a library sound — but only if nothing currently points at its path. UiSound rows are
// referenced by path, not id (see the model's comment in prisma/schema.prisma), so this has to
// check GlobalGameConfig's actual assigned paths rather than a foreign key; a plain DELETE would
// otherwise silently break whichever nav button (or the site-wide default) was using it.
import { defineEventHandler, createError } from 'h3'
import { rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { findSlotsUsingPath } from '@/server/utils/uiSoundLibraryUsage'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params.id
  const sound = await db.uiSound.findUnique({ where: { id } })
  if (!sound) throw createError({ statusCode: 404, statusMessage: 'Sound not found' })

  const config = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { uiClickSoundPath: true, uiNavButtonSounds: true }
  })
  const usedBy = findSlotsUsingPath(config, sound.path)
  if (usedBy.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `Still assigned to: ${usedBy.join(', ')}. Unassign it there first.`
    })
  }

  await db.uiSound.delete({ where: { id } })

  // Best-effort file cleanup — a directory served under /ui-sounds/ (dev) or
  // /images/ui-sounds/ (prod), matching where server/api/admin/global-config/ui-sounds.post.js
  // writes uploads. Never touches the bundled default, which isn't a library row.
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'ui-sounds')
    : join(baseDir, 'public', 'ui-sounds')
  const filename = sound.path.split('/').pop()
  if (filename) await rm(join(uploadDir, filename), { force: true }).catch(() => {})

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'UiSound',
      key: id,
      prevValue: `${sound.label} (${sound.path})`,
      newValue: null
    })
  } catch {}

  return { deleted: true }
})

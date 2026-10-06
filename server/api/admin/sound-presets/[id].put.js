// server/api/admin/sound-presets/[id].put.js
// Rename only — a preset's sound assignments are edited via the existing
// /api/admin/global-config/nav-sounds endpoint (which syncs back into whichever preset is
// currently active; see that file's updated comment), not through this one.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const preset = await db.uiSoundPreset.findUnique({ where: { id } })
  if (!preset) throw createError({ statusCode: 404, statusMessage: 'Preset not found' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  if (name !== preset.name) {
    const dup = await db.uiSoundPreset.findUnique({ where: { name } })
    if (dup && dup.id !== id) throw createError({ statusCode: 409, statusMessage: 'A preset with that name already exists' })
  }

  const updated = await db.uiSoundPreset.update({ where: { id }, data: { name } })

  await logAdminChange(db, { userId: me.id, area: 'UiSoundPreset', key: `rename:${id}`, prevValue: preset.name, newValue: name })

  return { ok: true }
})

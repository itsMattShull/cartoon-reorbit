// server/api/admin/sound-presets/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const preset = await db.uiSoundPreset.findUnique({ where: { id } })
  if (!preset) throw createError({ statusCode: 404, statusMessage: 'Preset not found' })

  const config = await db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { activeUiSoundPresetId: true } })
  if (config?.activeUiSoundPresetId === id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete the currently active preset — switch to another preset first' })
  }

  await db.uiSoundPreset.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'UiSoundPreset', key: `delete:${id}`, prevValue: preset, newValue: null })

  return { ok: true }
})

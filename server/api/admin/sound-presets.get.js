// server/api/admin/sound-presets.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [presets, config] = await Promise.all([
    db.uiSoundPreset.findMany({ orderBy: { name: 'asc' } }),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { activeUiSoundPresetId: true },
    }),
  ])

  return {
    activeUiSoundPresetId: config?.activeUiSoundPresetId || null,
    presets,
  }
})

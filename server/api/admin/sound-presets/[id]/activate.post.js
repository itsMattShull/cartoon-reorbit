// server/api/admin/sound-presets/[id]/activate.post.js
//
// "Activating" a preset copies its saved uiClickSoundPath/uiNavButtonSounds INTO the live
// GlobalGameConfig columns — the same two columns server/api/admin/global-config/nav-sounds.post.js
// writes and server/api/global-config.get.js reads — rather than making every sound consumer join
// through a preset table at read time. activeUiSoundPresetId is then just bookkeeping: it tells
// the admin UI which preset's name to show as "currently loaded" and lets nav-sounds.post.js know
// which preset row to keep in sync as the admin tweaks individual slots afterward.
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

  const before = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { uiClickSoundPath: true, uiNavButtonSounds: true, activeUiSoundPresetId: true },
  })

  const data = {
    uiClickSoundPath: preset.uiClickSoundPath,
    uiNavButtonSounds: preset.uiNavButtonSounds ?? {},
    activeUiSoundPresetId: id,
  }

  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data,
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'UiSoundPreset',
    key: `activate:${id}`,
    prevValue: before,
    newValue: { uiClickSoundPath: data.uiClickSoundPath, uiNavButtonSounds: data.uiNavButtonSounds, activeUiSoundPresetId: id },
  })

  return { activeUiSoundPresetId: id }
})

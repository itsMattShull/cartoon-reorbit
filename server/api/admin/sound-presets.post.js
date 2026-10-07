// server/api/admin/sound-presets.post.js
//
// Creates a new preset row. Body: { name: string, cloneFromCurrent?: boolean }. A fresh preset
// starts with no sound assignments (bundled defaults everywhere) unless cloneFromCurrent is set,
// which snapshots whatever is live right now — a convenient starting point for "mostly the same
// as Default, but swap three sounds" rather than reassigning every slot from scratch. Either way
// the preset is inert until activated (see [id]/activate.post.js) — creating one never touches
// the live GlobalGameConfig columns.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const existing = await db.uiSoundPreset.findUnique({ where: { name } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'A preset with that name already exists' })

  const data = { name, uiClickSoundPath: null, uiNavButtonSounds: null }
  if (body?.cloneFromCurrent) {
    const cfg = await db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { uiClickSoundPath: true, uiNavButtonSounds: true },
    })
    data.uiClickSoundPath = cfg?.uiClickSoundPath ?? null
    data.uiNavButtonSounds = cfg?.uiNavButtonSounds ?? null
  }

  const created = await db.uiSoundPreset.create({ data })

  await logAdminChange(db, { userId: me.id, area: 'UiSoundPreset', key: `create:${created.id}`, prevValue: null, newValue: created })

  return { id: created.id }
})

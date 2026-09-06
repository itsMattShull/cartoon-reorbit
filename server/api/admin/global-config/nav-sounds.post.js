// server/api/admin/global-config/nav-sounds.post.js
//
// Assigns (or clears) which library sound plays for one slot — the site-wide default or one
// specific main-nav button (see utils/navSoundSlots.js for the fixed set of valid slots).
// Body: { slot: string, soundId: string | null }. Resolves soundId against the UiSound library
// and stores the resolved PATH on GlobalGameConfig (uiClickSoundPath for 'default',
// uiNavButtonSounds[slot] otherwise) — not the id — so the public config read
// (server/api/global-config.get.js) never has to join against the library table.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { isNavSoundSlotKey } from '@/utils/navSoundSlots'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const body = await readBody(event)
  const slot = body?.slot
  const soundId = body?.soundId ?? null

  if (!isNavSoundSlotKey(slot)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown sound slot' })
  }

  let path = null
  if (soundId !== null) {
    if (typeof soundId !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid soundId' })
    }
    const sound = await db.uiSound.findUnique({ where: { id: soundId } })
    if (!sound) throw createError({ statusCode: 404, statusMessage: 'Sound not found' })
    path = sound.path
  }

  const before = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { uiClickSoundPath: true, uiNavButtonSounds: true }
  })

  let updated
  if (slot === 'default') {
    updated = await db.globalGameConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', uiClickSoundPath: path },
      update: { uiClickSoundPath: path }
    })
  } else {
    // Read-modify-write on the JSON map. Concurrent admin edits to two different slots could
    // race and drop one, but this is a low-traffic, single-admin-at-a-time admin screen — the
    // same trade-off every other JSON-config field in this table already makes.
    const nextNavSounds = { ...(before?.uiNavButtonSounds && typeof before.uiNavButtonSounds === 'object' ? before.uiNavButtonSounds : {}) }
    if (path === null) delete nextNavSounds[slot]
    else nextNavSounds[slot] = path

    updated = await db.globalGameConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', uiNavButtonSounds: nextNavSounds },
      update: { uiNavButtonSounds: nextNavSounds }
    })
  }

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: `uiNavButtonSounds.${slot}`,
      prevValue: slot === 'default' ? (before?.uiClickSoundPath ?? null) : (before?.uiNavButtonSounds?.[slot] ?? null),
      newValue: path
    })
  } catch {}

  return {
    uiClickSoundPath: updated.uiClickSoundPath,
    uiNavButtonSounds: updated.uiNavButtonSounds
  }
})

// server/api/admin/flappy-image.delete.js
// Clears a custom Flappy Powerpuff image slot back to its built-in default. The settings-save
// endpoint (game-config.post.js) deliberately refuses to null these columns — it only ever
// writes a slot when the client sends a non-null value — so an admin had no way to undo an
// upload short of overwriting it with another image. This is that missing "undo": a dedicated
// endpoint that just nulls the one column, mirroring flappy-image.post.js's own slot allowlist.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

// Kept in sync with flappy-image.post.js's own SLOT_COLUMNS by hand — duplicated rather than
// imported since these are two independent Nitro route files and the mapping is small and stable.
const SLOT_COLUMNS = {
  blossom: 'flappyBlossomImagePath',
  bubbles: 'flappyBubblesImagePath',
  buttercup: 'flappyButtercupImagePath',
  city: 'flappyCityImagePath'
}

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event).catch(() => null)
  const slot = typeof body?.slot === 'string' ? body.slot.trim() : ''
  if (!Object.hasOwn(SLOT_COLUMNS, slot)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slot' })
  }
  const column = SLOT_COLUMNS[slot]

  // The underlying uploaded file on disk is intentionally left in place — same as a fresh
  // upload leaving its predecessor behind (see flappy-image.post.js). Neither endpoint owns
  // file lifecycle; this only ever touches the DB pointer.
  const before = await db.gameConfig.findUnique({ where: { gameName: 'FlappyPowerpuff' } })
  await db.gameConfig.upsert({
    where: { gameName: 'FlappyPowerpuff' },
    create: { gameName: 'FlappyPowerpuff', [column]: null },
    update: { [column]: null, updatedAt: new Date() }
  })

  if ((before?.[column] ?? null) !== null) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GameConfig:FlappyPowerpuff',
      key: column,
      prevValue: before?.[column] ?? null,
      newValue: null
    }).catch(() => {})
  }

  return { slot, cleared: true }
})

import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const SLOT_FIELD = {
  winball:      'gameTileWinballImagePath',
  lotto:        'gameTileLottoImagePath',
  winwheel:     'gameTileWinwheelImagePath',
  clash:        'gameTileClashImagePath',
  tko:          'gameTileTkoImagePath',
  reorbitmatch: 'gameTileReorbitmatchImagePath',
  tower:        'gameTileTowerImagePath',
  reorbitmemory: 'gameTileReorbitmemoryImagePath',
  flappy:       'gameTileFlappyImagePath'
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const slot = String(body?.slot ?? '').trim()
  if (!SLOT_FIELD[slot]) throw createError({ statusCode: 400, statusMessage: `Invalid slot "${slot}"` })

  const field = SLOT_FIELD[slot]
  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })

  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, [field]: null },
    update: { [field]: null, updatedAt: new Date() }
  })

  if ((before?.[field] ?? null) !== null) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: field,
      prevValue: before?.[field] ?? null,
      newValue: null
    }).catch(() => {})
  }

  return { ok: true, slot }
})

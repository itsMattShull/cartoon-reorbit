import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif'])

const SLOT_FIELD = {
  winball:      'gameTileWinballImagePath',
  lotto:        'gameTileLottoImagePath',
  winwheel:     'gameTileWinwheelImagePath',
  clash:        'gameTileClashImagePath',
  tko:          'gameTileTkoImagePath',
  reorbitmatch: 'gameTileReorbitmatchImagePath',
  tower:        'gameTileTowerImagePath',
  reorbitmemory: 'gameTileReorbitmemoryImagePath',
  guessctoon:   'gameTileGuessctoonImagePath',
  asteroid:     'gameTileAsteroidImagePath',
  flappy:       'gameTileFlappyImagePath',
  blackjack:    'gameTileBlackjackImagePath',
  edrps:        'gameTileEdrpsImagePath',
  fruitsamurai: 'gameTileFruitsamuraiImagePath',
  reorbitchess: 'gameTileReorbitchessImagePath'
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  let slot = ''
  for (const p of parts) {
    if (p.filename) filePart = p
    else if (p.name === 'slot') slot = Buffer.isBuffer(p.data) ? p.data.toString('utf-8').trim() : String(p.data ?? '').trim()
  }

  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (!ALLOWED.has(filePart.type)) throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPG, SVG, or GIF allowed' })
  if (!SLOT_FIELD[slot]) throw createError({ statusCode: 400, statusMessage: `Invalid slot "${slot}"` })

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'game-tiles')
    : join(baseDir, 'public', 'game-tiles')
  await mkdir(uploadDir, { recursive: true })

  const safeExt = extname(filePart.filename || '').toLowerCase() || (
    filePart.type === 'image/svg+xml' ? '.svg'
    : filePart.type === 'image/png' ? '.png'
    : filePart.type === 'image/gif' ? '.gif'
    : '.jpg'
  )
  const filename = `${slot}-${Date.now()}${safeExt}`
  await writeFile(join(uploadDir, filename), filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/game-tiles/${filename}`
    : `/game-tiles/${filename}`

  const field = SLOT_FIELD[slot]
  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, [field]: assetPath },
    update: { [field]: assetPath, updatedAt: new Date() }
  })

  if ((before?.[field] ?? null) !== assetPath) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: field,
      prevValue: before?.[field] ?? null,
      newValue: assetPath
    }).catch(() => {})
  }

  return { assetPath, slot }
})

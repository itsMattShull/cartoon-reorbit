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
import { MAX_IMAGE_BYTES, sniffImageType, assertInside } from '@/server/utils/imageUploadValidation'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// The format is decided by the file's magic bytes, not by filePart.type -- that is the
// multipart Content-Type, which the client writes and can set to anything.
//
// SVG is no longer accepted. Production serves this directory through nginx, which picks
// Content-Type from the extension, so an SVG here executes script on direct navigation from
// the app's own origin, with the admin's session cookie and no CSP to contain it. The
// extension is likewise no longer taken from the client's filename: declaring image/png while
// naming the file x.html previously wrote a document served as text/html.
const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
}

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
  pokemonbattle: 'gameTilePokemonbattleImagePath'
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
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }
  const sniffed = sniffImageType(filePart.data)
  if (!sniffed || !EXT_BY_TYPE[sniffed]) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPG, GIF or WebP images are allowed' })
  }
  if (!SLOT_FIELD[slot]) throw createError({ statusCode: 400, statusMessage: `Invalid slot "${slot}"` })

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'game-tiles')
    : join(baseDir, 'public', 'game-tiles')
  await mkdir(uploadDir, { recursive: true })

  // Every component is server-controlled: an allowlisted slot, a clock reading, and an
  // extension looked up from the sniffed type.
  const filename = `${slot}-${Date.now()}${EXT_BY_TYPE[sniffed]}`
  await writeFile(assertInside(uploadDir, join(uploadDir, filename)), filePart.data)

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

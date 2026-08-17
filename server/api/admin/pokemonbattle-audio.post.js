// Uploads the Pokemon: Fire, Water, Grass! battle or menu music.
//
// Validation lives in server/utils/audioUploadValidation.js — see that file for why the
// existing winwheel-sound.post.js pattern was not safe to copy. In short: the format is
// decided by magic bytes, the saved extension is looked up from the sniffed type, and nothing
// the client sent reaches the filename.
//
// The size cap is tighter than the generic audio cap because this file downloads for every
// player who opens the game. A battle loop is a loop, not a song: 60-90 seconds at 96kbps mono
// is around 1MB and sounds fine behind a game.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor } from '@/server/utils/audioUploadValidation'
import { invalidateAssets } from '@/server/utils/pokemonBattleAssets'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const SLOTS = new Set(['battlemusic', 'menumusic'])

// 1.5MB. Both tracks together are then ~3MB on a cold cache, which is already a noticeable
// chunk of a metered connection; the client additionally refuses to preload either on a
// save-data or slow connection.
const MAX_MUSIC_BYTES = 1_536_000

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const slotPart = parts.find(p => !p.filename && p.name === 'slot')
  const slot = slotPart
    ? (Buffer.isBuffer(slotPart.data) ? slotPart.data.toString('utf-8') : String(slotPart.data)).trim()
    : ''
  if (!SLOTS.has(slot)) throw createError({ statusCode: 400, statusMessage: 'Invalid slot' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing audio file' })
  if (filePart.data.length > MAX_MUSIC_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Music must be 1.5MB or smaller — use a 60-90 second loop at 96kbps'
    })
  }

  const sniffed = sniffAudioType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only MP3, OGG or WAV audio is allowed' })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'pokemonbattle')
    : join(baseDir, 'public', 'pokemonbattle')
  await mkdir(uploadDir, { recursive: true })

  const filename = `${slot}-${Date.now()}${audioExtFor(sniffed)}`
  await writeFile(assertInside(uploadDir, join(uploadDir, filename)), filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/pokemonbattle/${filename}`
    : `/pokemonbattle/${filename}`

  const before = await db.gameConfig.findUnique({
    where: { gameName: 'PokemonBattle' },
    select: { pokemonBattleAssets: true }
  })
  const assets = { ...(before?.pokemonBattleAssets || {}) }
  const prev = assets[slot]?.path ?? null
  assets[slot] = { path: assetPath, width: null, height: null, animated: false }

  await db.gameConfig.upsert({
    where: { gameName: 'PokemonBattle' },
    create: { gameName: 'PokemonBattle', pokemonBattleAssets: assets },
    update: { pokemonBattleAssets: assets, updatedAt: new Date() }
  })
  invalidateAssets()

  await logAdminChange(db, {
    userId: me.id,
    area: 'GameConfig:PokemonBattle',
    key: `audio:${slot}`,
    prevValue: prev,
    newValue: assetPath
  }).catch(() => {})

  return { slot, assetPath }
})

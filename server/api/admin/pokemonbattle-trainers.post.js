// Creates or updates one cosmetic trainer for Pokemon: Fire, Water, Grass!.
//
// The trainer NAME is the one admin-supplied string that reaches every visitor's DOM — it is
// served by the public config endpoint, including to logged-out users, and shown next to the
// player's own name in the match HUD. "Admin-supplied" is not the same as trusted: admin
// accounts get phished, and the blast radius here is site-wide. So the name is validated on
// write and REJECTED rather than silently stripped, so the admin sees what happened.
//
// The page renders it with normal interpolation and never v-html — asserted in
// tests/pokemonBattleWiring.test.js, because the natural way to bold a trainer's name inside a
// battle-text line is exactly the edit that would introduce v-html.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, assertInside } from '@/server/utils/imageUploadValidation'
import { invalidateTrainerRoster } from '@/server/utils/pokemonBattleConfig'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const MAX_NAME = 24
const LOBBY_WIDTH = 320
const THUMB_WIDTH = 96
// One frame only. A trainer portrait sits in the HUD for the whole match; an animated one
// would decode continuously alongside two animated battle sprites on a phone.
const MAX_TRAINERS = 200

// Allowed: letters, digits, spaces, and a few name punctuation marks. Rejected explicitly:
// C0/C1 controls, and the bidi/format ranges — a right-to-left override in a public roster
// reorders adjacent names on screen and in any admin log line the value lands in.
const NAME_OK = /^[\p{L}\p{N} .'\-]+$/u
// Written as escapes, never as literal characters: these are by definition invisible in a
// source file, so a literal here is unreviewable, and one silently dropped by an editor or a
// copy-paste would leave the check quietly weaker than it reads.
const NAME_BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/

function validateName(raw) {
  // NFKC first so a lookalike composed form cannot slip past the allowlist.
  const name = String(raw ?? '').normalize('NFKC').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Trainer name is required' })
  if (name.length > MAX_NAME) {
    throw createError({ statusCode: 400, statusMessage: `Trainer name must be ${MAX_NAME} characters or fewer` })
  }
  if (NAME_BAD.test(name) || !NAME_OK.test(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Trainer name may only contain letters, numbers, spaces, apostrophes and hyphens'
    })
  }
  return name
}

const field = (parts, name) => {
  const p = parts.find(x => !x.filename && x.name === name)
  if (!p) return null
  return (Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data)).trim()
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const id = field(parts, 'id') || null
  const name = validateName(field(parts, 'name'))
  const sortOrder = Number.parseInt(field(parts, 'sortOrder') ?? '0', 10) || 0
  const active = field(parts, 'active') !== 'false'

  if (id && !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trainer id' })
  }
  if (!id) {
    const count = await db.pokemonBattleTrainer.count()
    if (count >= MAX_TRAINERS) {
      throw createError({ statusCode: 400, statusMessage: `At most ${MAX_TRAINERS} trainers` })
    }
  }

  // Image is required on create, optional on rename.
  const filePart = parts.find(p => p.filename)
  let imageData = null
  if (filePart) {
    if (filePart.data.length > MAX_IMAGE_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
    }
    if (!sniffImageType(filePart.data)) {
      throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF or WebP images are allowed' })
    }

    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'pokemonbattle')
      : join(baseDir, 'public', 'pokemonbattle')
    await mkdir(uploadDir, { recursive: true })

    const stamp = Date.now()
    let big, small, meta
    try {
      // Flattened to a single frame deliberately — see MAX_TRAINERS note above. Two sizes so
      // the 28px HUD portrait does not download the 320px lobby image.
      const base = () => sharp(filePart.data, { animated: false, limitInputPixels: 40_000_000 })
        .timeout({ seconds: 15 })
      big = await base().resize({ width: LOBBY_WIDTH, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
      small = await base().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
      meta = await sharp(big).metadata()
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
    }

    const bigName = `trainer-${stamp}.webp`
    const smallName = `trainer-${stamp}-thumb.webp`
    await writeFile(assertInside(uploadDir, join(uploadDir, bigName)), big)
    await writeFile(assertInside(uploadDir, join(uploadDir, smallName)), small)

    const prefix = process.env.NODE_ENV === 'production' ? '/images/pokemonbattle' : '/pokemonbattle'
    imageData = {
      imagePath: `${prefix}/${bigName}`,
      thumbPath: `${prefix}/${smallName}`,
      width: meta.width || null,
      height: meta.height || null
    }
  }

  let row
  if (id) {
    const before = await db.pokemonBattleTrainer.findUnique({ where: { id } })
    if (!before) throw createError({ statusCode: 404, statusMessage: 'Trainer not found' })
    row = await db.pokemonBattleTrainer.update({
      where: { id },
      data: { name, sortOrder, active, ...(imageData || {}) }
    })
    // Roster edits are the vector for anything nasty in a trainer name, so every one is
    // logged, not just the config-column changes the upload precedents record.
    await logAdminChange(db, {
      userId: me.id, area: 'PokemonBattleTrainer', key: `update:${id}`,
      prevValue: before.name, newValue: name
    }).catch(() => {})
  } else {
    if (!imageData) throw createError({ statusCode: 400, statusMessage: 'A trainer image is required' })
    row = await db.pokemonBattleTrainer.create({ data: { name, sortOrder, active, ...imageData } })
    await logAdminChange(db, {
      userId: me.id, area: 'PokemonBattleTrainer', key: `create:${row.id}`,
      prevValue: null, newValue: name
    }).catch(() => {})
  }

  invalidateTrainerRoster()
  return {
    id: row.id, name: row.name, imagePath: row.imagePath, thumbPath: row.thumbPath,
    width: row.width, height: row.height, sortOrder: row.sortOrder, active: row.active
  }
})

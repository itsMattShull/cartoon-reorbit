// Uploads one Pokemon: Fire, Water, Grass! art asset (sprite, logo or backdrop).
//
// Follows fruitsamurai-image.post.js, which is the good upload precedent in this repo:
// allowlisted slot -> storage key (the slot never reaches the filename and never builds a
// column name), magic-byte sniffing rather than the client-supplied Content-Type, and a sharp
// re-encode instead of storing the upload as-is.
//
// Two things it does NOT copy, both because this endpoint accepts animated art:
//
//   1. It probes metadata BEFORE any pixel work and rejects on frame count and total pixels,
//      not only on file size. Byte size is not a proxy for decoded size for GIF: LZW expands
//      enormously and frames are nearly free in the file, so 5MB of input can be a gigabyte of
//      decoded RGBA. libvips loads an animated image as one tall strip -- height x pages --
//      and nuxt-server runs two cluster workers with max_memory_restart at 2G, so one crafted
//      upload could OOM-restart a worker.
//   2. Uploads are serialised through a module-level mutex. libvips sizes its threadpool to
//      the core count, so three concurrent animated encodes is 3x cores of decode threads on a
//      box that is also serving the site.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, assertInside } from '@/server/utils/imageUploadValidation'
import { invalidateAssets } from '@/server/utils/pokemonBattleAssets'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// Allowlisted slots. The value is the key inside GameConfig.pokemonBattleAssets and the stem
// of the saved filename — both server-controlled. A slot that is not in this map is refused
// before anything is read, so nothing client-supplied ever reaches a path or a column.
//
// maxWidth is enforced by re-encoding, not by asking. Budgets are deliberate: six sprites at
// 512px cover the largest a sprite is ever drawn (a ~350px-tall stage on a desktop at 2x DPR),
// and everything on this page loads for every visitor, whether or not they play PvP.
const SLOTS = {
  'charizard-front': { maxWidth: 512 },
  'charizard-back': { maxWidth: 512 },
  'blastoise-front': { maxWidth: 512 },
  'blastoise-back': { maxWidth: 512 },
  'venusaur-front': { maxWidth: 512 },
  'venusaur-back': { maxWidth: 512 },
  logo: { maxWidth: 640 },
  battlebg: { maxWidth: 1024 },
  menubg: { maxWidth: 1024 }
}

// Animated limits. 120 frames is generous for a battle sprite; 40MP total is well under
// libvips' ~268MP default, which at RGBA would already be ~1GB of resident memory.
const MAX_FRAMES = 120
const MAX_FRAME_PIXELS = 4_000_000
const MAX_TOTAL_PIXELS = 40_000_000
// The re-encoded result is served to every player, so cap the output as well as the input.
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

let queue = Promise.resolve()
const serialize = (fn) => {
  const run = queue.then(fn, fn)
  // Keep the chain alive regardless of outcome, but don't retain results.
  queue = run.then(() => {}, () => {})
  return run
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const slotPart = parts.find(p => !p.filename && p.name === 'slot')
  const slot = slotPart
    ? (Buffer.isBuffer(slotPart.data) ? slotPart.data.toString('utf-8') : String(slotPart.data)).trim()
    : ''
  if (!Object.hasOwn(SLOTS, slot)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slot' })
  }

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  // SVG is deliberately unsupported: sniffImageType does not recognise it, and it would
  // execute script on direct navigation from this origin.
  const sniffed = sniffImageType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF or WebP images are allowed' })
  }

  const animated = sniffed === 'image/gif' || sniffed === 'image/webp'

  const { output, width, height, pages } = await serialize(async () => {
    let meta
    try {
      meta = await sharp(filePart.data, { animated, limitInputPixels: MAX_TOTAL_PIXELS }).metadata()
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Could not read that image' })
    }

    const frames = meta.pages || 1
    // pageHeight is the per-frame height; meta.height is the whole strip for animated input.
    const frameHeight = meta.pageHeight || meta.height || 0
    if (frames > MAX_FRAMES) {
      throw createError({ statusCode: 400, statusMessage: `Too many frames (${frames}); max is ${MAX_FRAMES}` })
    }
    if ((meta.width || 0) * frameHeight > MAX_FRAME_PIXELS) {
      throw createError({ statusCode: 400, statusMessage: 'Image dimensions are too large' })
    }
    if ((meta.width || 0) * frameHeight * frames > MAX_TOTAL_PIXELS) {
      throw createError({ statusCode: 400, statusMessage: 'Animation is too large to process' })
    }

    let buf
    try {
      buf = await sharp(filePart.data, { animated, limitInputPixels: MAX_TOTAL_PIXELS })
        .timeout({ seconds: 20 })
        // Width ONLY. Passing a height (or any fit that touches it) resizes the concatenated
        // animation strip instead of the frames and shreds the animation.
        .resize({ width: SLOTS[slot].maxWidth, withoutEnlargement: true })
        // effort is capped low on purpose: animated WebP encode cost scales with frames x
        // effort, and the default on a long animation is minutes of CPU.
        .webp({ quality: 82, effort: animated ? 2 : 4 })
        .toBuffer()
    } catch (err) {
      if (err?.statusCode) throw err
      throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
    }

    if (buf.length > MAX_OUTPUT_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: 'That image is too heavy once processed; use a smaller or shorter one'
      })
    }

    // Re-read from the ENCODED bytes so the stored dimensions describe what the browser will
    // actually load. The page reserves space from these, so a wrong number is a layout shift.
    const out = await sharp(buf, { animated }).metadata()
    return {
      output: buf,
      width: out.width || null,
      height: out.pageHeight || out.height || null,
      pages: out.pages || 1
    }
  })

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'pokemonbattle')
    : join(baseDir, 'public', 'pokemonbattle')
  await mkdir(uploadDir, { recursive: true })

  const filename = `${slot}-${Date.now()}.webp`
  await writeFile(assertInside(uploadDir, join(uploadDir, filename)), output)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/pokemonbattle/${filename}`
    : `/pokemonbattle/${filename}`

  const before = await db.gameConfig.findUnique({
    where: { gameName: 'PokemonBattle' },
    select: { pokemonBattleAssets: true }
  })
  const assets = { ...(before?.pokemonBattleAssets || {}) }
  const prev = assets[slot]?.path ?? null
  assets[slot] = { path: assetPath, width, height, animated: pages > 1 }

  await db.gameConfig.upsert({
    where: { gameName: 'PokemonBattle' },
    create: { gameName: 'PokemonBattle', pokemonBattleAssets: assets },
    update: { pokemonBattleAssets: assets, updatedAt: new Date() }
  })
  invalidateAssets()

  await logAdminChange(db, {
    userId: me.id,
    area: 'GameConfig:PokemonBattle',
    key: `asset:${slot}`,
    prevValue: prev,
    newValue: assetPath
  }).catch(() => {})

  return { slot, assetPath, width, height, animated: pages > 1 }
})

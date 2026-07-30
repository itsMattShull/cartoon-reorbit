// server/api/admin/favicon.post.js
// Uploads a single master image, then regenerates the full site favicon /
// meta-icon set (used site-wide, by every visitor) from it via sharp.
//
// Output filenames are fixed constants only — never derived from client
// input — because they overwrite the exact paths already referenced by
// pages/index.vue's useHead(). Writes are atomic (temp file + rename) so a
// concurrent visitor request never sees a half-updated icon set.
import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// Raster only — SVG is deliberately not accepted. Untrusted SVG rasterized by
// librsvg (and any future path that might pass an uploaded SVG through as-is)
// is an XXE/script-injection risk that's out of proportion for an asset
// served to every site visitor.
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_INPUT_PIXELS = 30_000_000 // guards against decompression-bomb-style crafted images

// Fixed output filenames — must match pages/index.vue's useHead() exactly.
const PNG_SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-96x96.png', size: 96 },
  { name: 'android-icon-36x36.png', size: 36 },
  { name: 'android-icon-48x48.png', size: 48 },
  { name: 'android-icon-72x72.png', size: 72 },
  { name: 'android-icon-96x96.png', size: 96 },
  { name: 'android-icon-144x144.png', size: 144 },
  { name: 'android-icon-192x192.png', size: 192 },
  { name: 'apple-icon-57x57.png', size: 57 },
  { name: 'apple-icon-60x60.png', size: 60 },
  { name: 'apple-icon-72x72.png', size: 72 },
  { name: 'apple-icon-76x76.png', size: 76 },
  { name: 'apple-icon-114x114.png', size: 114 },
  { name: 'apple-icon-120x120.png', size: 120 },
  { name: 'apple-icon-144x144.png', size: 144 },
  { name: 'apple-icon-152x152.png', size: 152 },
  { name: 'apple-icon-180x180.png', size: 180 },
  { name: 'apple-icon.png', size: 180 },
  { name: 'apple-icon-precomposed.png', size: 180 },
  { name: 'ms-icon-70x70.png', size: 70 },
  { name: 'ms-icon-144x144.png', size: 144 },
  { name: 'ms-icon-150x150.png', size: 150 },
  { name: 'ms-icon-310x310.png', size: 310 }
]
const ICO_SOURCE_SIZES = [16, 32, 48]
const ICO_NAME = 'favicon.ico'
const MASTER_PREFIX = 'favicon-master-'

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  let imagePart = null
  for (const part of parts || []) {
    if (part.filename && part.name === 'image') imagePart = part
  }
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!ALLOWED_TYPES.has(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG, JPG, or WEBP only.' })
  }
  if (!imagePart.data || imagePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 5MB or smaller.' })
  }

  // 3) Decode + auto-orient (EXIF) up front, so downstream width/height and
  // the crop box always match what will actually be rendered — this also
  // fails closed on anything sharp can't parse, which rejects mismatched/
  // spoofed Content-Type since sharp sniffs the real file header rather than
  // trusting it.
  let orientedBuffer, meta
  try {
    orientedBuffer = await sharp(imagePart.data, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .toBuffer()
    meta = await sharp(orientedBuffer).metadata()
    if (!meta.width || !meta.height) throw new Error('no dimensions')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not read image — file may be corrupt, too large, or an unsupported format.' })
  }

  // 4) Center-crop to square so every generated size is a clean square icon
  const side = Math.min(meta.width, meta.height)
  const squareBuffer = await sharp(orientedBuffer)
    .extract({
      left: Math.floor((meta.width - side) / 2),
      top: Math.floor((meta.height - side) / 2),
      width: side,
      height: side
    })
    .png()
    .toBuffer()

  // 5) Generate every fixed-size PNG variant
  const generated = await Promise.all(
    PNG_SIZES.map(async ({ name, size }) => ({
      name,
      buffer: await sharp(squareBuffer).resize(size, size).png().toBuffer()
    }))
  )

  // 6) Encode favicon.ico from a few representative sizes
  const icoSourceBuffers = await Promise.all(
    ICO_SOURCE_SIZES.map((size) => sharp(squareBuffer).resize(size, size).png().toBuffer())
  )
  let icoBuffer
  try {
    icoBuffer = await pngToIco(icoSourceBuffers)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to encode favicon.ico.' })
  }

  // 7) Retain the master upload (for re-generation/audit — derived variants
  // alone give no way to redo the crop or recover the original later)
  const masterExt = imagePart.type === 'image/png' ? '.png'
    : imagePart.type === 'image/webp' ? '.webp'
    : '.jpg'
  const masterFilename = `${MASTER_PREFIX}${Date.now()}${masterExt}`

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images')
    : join(baseDir, 'public', 'images')
  await mkdir(uploadDir, { recursive: true })

  // 8) Atomic writes: write every file to a temp name in the same directory,
  // then rename() into place (atomic on the same filesystem) only once all
  // renders succeeded — so a mid-batch failure never leaves a mismatched
  // icon set live, and no visitor ever reads a partially-written file.
  const allOutputs = [...generated, { name: ICO_NAME, buffer: icoBuffer }, { name: masterFilename, buffer: imagePart.data }]
  const tmpSuffix = `.tmp-${randomUUID()}`
  const written = []
  try {
    await Promise.all(allOutputs.map(async ({ name, buffer }) => {
      const tmpPath = join(uploadDir, `${name}${tmpSuffix}`)
      await writeFile(tmpPath, buffer)
      written.push(tmpPath)
    }))
    await Promise.all(allOutputs.map(({ name }) =>
      rename(join(uploadDir, `${name}${tmpSuffix}`), join(uploadDir, name))
    ))
  } catch (err) {
    await Promise.all(written.map((p) => rm(p, { force: true }).catch(() => {})))
    throw createError({ statusCode: 500, statusMessage: 'Failed to save favicon files.' })
  }

  const faviconVersion = BigInt(Date.now())
  // Both prod (cartoon-reorbit-images/) and dev (public/images/) write to a
  // directory served at the same /images/ URL prefix.
  const masterAssetPath = `/images/${masterFilename}`

  // 9) Persist + audit log
  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', faviconVersion, faviconSourcePath: masterAssetPath },
    update: { faviconVersion, faviconSourcePath: masterAssetPath }
  })

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'faviconVersion',
      prevValue: before?.faviconSourcePath ?? null,
      newValue: masterAssetPath
    })
  } catch {}

  // Best-effort cleanup of the previous master upload so these don't
  // accumulate on disk indefinitely.
  if (before?.faviconSourcePath?.startsWith('/images/') && before.faviconSourcePath.includes(MASTER_PREFIX)) {
    const prevFilename = before.faviconSourcePath.slice('/images/'.length)
    if (prevFilename !== masterFilename) {
      await rm(join(uploadDir, prevFilename), { force: true }).catch(() => {})
    }
  }

  return {
    faviconVersion: faviconVersion.toString(),
    faviconSourcePath: masterAssetPath
  }
})

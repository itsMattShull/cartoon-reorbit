// server/api/admin/tutorial/image.post.js
// Uploads the tutorial page's hero image. Follows the favicon upload's
// hardening (server/api/admin/favicon.post.js), not the plainer homepage
// upload pattern: raster-only (no SVG), byte + pixel caps, decode-and-re-encode
// through sharp (this is what actually neutralizes a polyglot/malformed file,
// not the resize alone), and a server-generated filename only.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { clearTutorialConfigCache } from '@/server/utils/tutorialConfigCache'

// Same directory depth as server/api/admin/homepage/index.post.js
// (server/api/admin/tutorial/) — mirror its baseDir calculation exactly.
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_INPUT_PIXELS = 30_000_000 // guards against decompression-bomb-style crafted images
const SIDE = 200

const publicAssetPath = (filename) =>
  process.env.NODE_ENV === 'production' ? `/images/tutorial/${filename}` : `/tutorial/${filename}`

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const parts = await readMultipartFormData(event)
  const imagePart = (parts || []).find((p) => p.filename && p.name === 'image')
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!ALLOWED_TYPES.has(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG, JPG, or WEBP only.' })
  }
  if (!imagePart.data || imagePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 5MB or smaller.' })
  }

  // Decode + auto-orient, then always re-encode through sharp to a fresh PNG
  // buffer — this both center-crops/resizes to exactly 200x200 and strips
  // anything beyond valid pixel data (the real defense against a spoofed or
  // polyglot file, not the MIME check alone).
  let outBuffer
  try {
    outBuffer = await sharp(imagePart.data, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(SIDE, SIDE, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not read image — file may be corrupt, too large, or an unsupported format.' })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'tutorial')
    : join(baseDir, 'public', 'tutorial')
  await mkdir(uploadDir, { recursive: true })

  const filename = `hero-${Date.now()}.png`
  await writeFile(join(uploadDir, filename), outBuffer)
  const assetPath = publicAssetPath(filename)

  const current = await db.tutorialConfig.findUnique({ where: { id: 'tutorial' } })
  const cfg = await db.tutorialConfig.upsert({
    where: { id: 'tutorial' },
    create: { id: 'tutorial', heroImagePath: assetPath },
    update: { heroImagePath: assetPath, updatedAt: new Date() }
  })

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'TutorialConfig',
      key: 'heroImagePath',
      prevValue: current?.heroImagePath ?? null,
      newValue: assetPath
    })
  } catch {}

  clearTutorialConfigCache()

  // Best-effort cleanup of the previous hero image so uploads don't accumulate.
  if (current?.heroImagePath) {
    const prevPrefix = process.env.NODE_ENV === 'production' ? '/images/tutorial/' : '/tutorial/'
    if (current.heroImagePath.startsWith(prevPrefix)) {
      const prevFilename = current.heroImagePath.slice(prevPrefix.length)
      if (prevFilename !== filename) {
        await rm(join(uploadDir, prevFilename), { force: true }).catch(() => {})
      }
    }
  }

  return { heroImagePath: cfg.heroImagePath }
})

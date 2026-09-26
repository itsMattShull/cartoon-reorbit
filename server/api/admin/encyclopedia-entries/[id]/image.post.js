// server/api/admin/encyclopedia-entries/[id]/image.post.js
// Uploads (or replaces) an entry's hero image. Unlike the Tutorial page's hero (server/api/admin/
// tutorial/image.post.js, a fixed 1600x400 banner), an entry's hero is deliberately free-form —
// any image, any aspect ratio, shown in full on the entry page (see the `object-fit: contain`
// comment in pages/newsite/encyclopedia/[slug].vue) rather than cropped/warped into a fixed
// shape. `fit: 'inside'` + `withoutEnlargement` below only ever scales an oversized image DOWN to
// fit within the cap, preserving its original aspect ratio exactly — it never crops, never
// stretches, and never upscales a small image past its native size. This one also accepts an
// animated GIF (per this feature's explicit "JPG, PNG or GIF" spec), following the same
// sniffed-bytes + resizeAnimatedGif pattern as the cMoon Enemy Battles faction banner upload
// (server/api/admin/cmoon-enemy-factions/[id]/image.post.js).
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, resizeAnimatedGif } from '@/server/utils/imageUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'encyclopedia'
// A cap, not a target shape — see the file header comment. Generous enough that a normal photo
// or screenshot never gets touched at all; only guards against an unreasonably huge original
// bloating storage/page weight.
const HERO_MAX_WIDTH = 1600
const HERO_MAX_HEIGHT = 1600
const GIF_MAX_FRAMES = 200
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif']
const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const entry = await db.encyclopediaEntry.findUnique({ where: { id } })
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Encyclopedia entry not found' })

  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const sniffed = sniffImageType(filePart.data)
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPG, PNG, or GIF images are allowed' })
  }

  const isGif = sniffed === 'image/gif'
  let output
  try {
    output = isGif
      ? await resizeAnimatedGif(filePart.data, HERO_MAX_WIDTH, HERO_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true, maxFrames: GIF_MAX_FRAMES })
      : await sharp(filePart.data, { limitInputPixels: 40_000_000 })
          .timeout({ seconds: 15 })
          .resize({ width: HERO_MAX_WIDTH, height: HERO_MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer()
  } catch (err) {
    const message = /too many frames/.test(err?.message || '') ? err.message : 'Could not process that image'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })

  const filename = `encyclopedia-${id}-${Date.now()}.${isGif ? 'gif' : 'webp'}`
  await writeFile(uploadFsPath(FEATURE, filename), output)
  const newImagePath = uploadPublicPath(FEATURE, filename)

  const oldImagePath = entry.heroImagePath
  await db.encyclopediaEntry.update({ where: { id }, data: { heroImagePath: newImagePath } })

  if (oldImagePath) {
    const oldFilename = oldImagePath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'EncyclopediaEntry', key: `image:${id}`, prevValue: oldImagePath, newValue: newImagePath,
  })

  return { id, heroImagePath: newImagePath }
})

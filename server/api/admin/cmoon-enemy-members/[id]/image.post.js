// server/api/admin/cmoon-enemy-members/[id]/image.post.js
// Uploads (or replaces) an enemy member's portrait — the character art shown in the battle popup.
// Kept as its own multipart endpoint, same split rationale as
// server/api/admin/cmoons/[id]/image.post.js.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, resizeAnimatedGif } from '@/server/utils/imageUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-enemy-members'
// `fit: 'contain'` with a transparent background, exactly like
// server/api/admin/cmoon-join-effects/[id]/image.post.js: a monster/character portrait is
// arbitrary admin art, not commissioned to a fixed crop, so it must never lose a head or a tail to
// cropping — the square box is letterboxed transparently instead, so the portrait sits cleanly
// over the faction banner behind it.
const STATIC_OUTPUT = 600
// Smaller box for animated uploads — the battle popup appears site-wide while browsing, the same
// "forced-autoplay on a common path" concern the join-effect upload's own GIF cap addresses.
const GIF_OUTPUT = 400
const GIF_MAX_FRAMES = 90
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

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

  // Bytes are sniffed, never trusted from the client-declared type/filename (see server/utils/imageUploadValidation.js).
  const sniffed = sniffImageType(filePart.data)
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF, or WebP images are allowed' })
  }

  const isGif = sniffed === 'image/gif'
  let output
  try {
    output = isGif
      ? await resizeAnimatedGif(filePart.data, GIF_OUTPUT, GIF_OUTPUT, { fit: 'contain', background: TRANSPARENT, maxFrames: GIF_MAX_FRAMES })
      : await sharp(filePart.data, { limitInputPixels: 40_000_000 })
          .timeout({ seconds: 15 })
          .ensureAlpha()
          .resize({ width: STATIC_OUTPUT, height: STATIC_OUTPUT, fit: 'contain', background: TRANSPARENT })
          .webp({ quality: 90 })
          .toBuffer()
  } catch (err) {
    const message = /too many frames/.test(err?.message || '') ? err.message : 'Could not process that image'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })

  // Server-generated name only — never the client's filename or extension.
  const filename = `cmoon-enemy-member-${id}-${Date.now()}.${isGif ? 'gif' : 'webp'}`
  await writeFile(uploadFsPath(FEATURE, filename), output)
  const newImagePath = uploadPublicPath(FEATURE, filename)

  const oldImagePath = member.imagePath
  await db.cMoonEnemyMember.update({ where: { id }, data: { imagePath: newImagePath } })

  if (oldImagePath) {
    const oldFilename = oldImagePath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonEnemyMember', key: `image:${id}`, prevValue: oldImagePath, newValue: newImagePath,
  })

  return { id, imagePath: newImagePath }
})

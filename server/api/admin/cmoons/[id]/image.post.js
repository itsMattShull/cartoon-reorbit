// server/api/admin/cmoons/[id]/image.post.js
// Uploads (or replaces) a cMoon's poster art shown in the "choose your cMoon" picker.
//
// Kept as its own multipart endpoint rather than folding onto cmoons.post.js/[id].put.js
// (which take plain JSON for name/color/captains/prizes): those two callers, tests, and the
// admin form's existing save() all stay untouched, and image upload/removal becomes an
// independent action the admin can retry without resubmitting the rest of the form — same
// split already used for backgrounds (backgrounds.post.js vs backgrounds/[id]/replace-image.post.js).
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType } from '@/server/utils/imageUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

const FEATURE = 'cmoons'
// Matches the poster proportions of the original "choose your world" screen this recreates.
// Re-encoding to a fixed size (rather than validating the upload's own dimensions) means any
// reasonably-sized source works, retina displays get a sharp image, and there's no exact-pixel
// hoop for the admin to jump through.
const OUTPUT_WIDTH = 600
const OUTPUT_HEIGHT = 900
// GIF is sniffable/allowed elsewhere in this codebase, but an animated poster in a blocking
// post-login modal costs every player, so this feature only accepts static formats.
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
// Rough multipart overhead margin on top of the real image cap, checked against the
// client-declared Content-Length before the body is buffered into memory.
const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

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

  // The multipart "type" field and filename are both client-supplied and spoofable — the
  // extension on disk is derived from sniffed bytes below, never from either of those.
  const sniffed = sniffImageType(filePart.data)
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, or WebP images are allowed' })
  }

  let output
  try {
    output = await sharp(filePart.data, { limitInputPixels: 40_000_000 })
      .timeout({ seconds: 15 })
      .resize({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, fit: 'cover', position: 'attention' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
  }

  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })

  // Server-generated name only — never the client's filename or extension, which is exactly
  // what would let a mislabeled upload land as e.g. a same-origin .html file.
  const filename = `cmoon-${id}-${Date.now()}.webp`
  await writeFile(uploadFsPath(FEATURE, filename), output)
  const newImagePath = uploadPublicPath(FEATURE, filename)

  const oldImagePath = cmoon.imagePath
  await db.cMoon.update({ where: { id }, data: { imagePath: newImagePath } })
  invalidateCMoonList()

  if (oldImagePath) {
    const oldFilename = oldImagePath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'cMoon', key: `image:${id}`, prevValue: oldImagePath, newValue: newImagePath,
  })

  return { id, imagePath: newImagePath }
})

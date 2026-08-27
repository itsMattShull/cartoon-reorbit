// server/api/admin/cmoons/[id]/avatar-image.post.js
// Uploads (or replaces) a cMoon's small "avatar" — shown next to its colored name badge on
// member cZones, sized/presented like a player avatar. Follows the stricter of this codebase's
// two existing cMoon-image patterns: magic-byte sniffing restricted to static formats (an
// animated avatar would be a bigger nuisance per-view than the poster art it's modeled on),
// input pixel/time limits on sharp (image.post.js has these, page-image.post.js doesn't — this
// keeps the safer pair), and path-containment checks (page-image.post.js's, image.post.js
// predates them).
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, sanitizePathSegment, assertInside } from '@/server/utils/imageUploadValidation'
import { cmoonAvatarUploadDir, cmoonAvatarFsPath, cmoonAvatarPublicPath } from '@/server/utils/cmoonImageStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

const OUTPUT_SIZE = 128
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
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
  const filePart = parts?.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const sniffed = sniffImageType(filePart.data)
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, or WebP images are allowed' })
  }

  let output
  try {
    output = await sharp(filePart.data, { limitInputPixels: 40_000_000 })
      .timeout({ seconds: 15 })
      .rotate()
      .resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE, fit: 'cover', position: 'attention' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
  }

  const dir = cmoonAvatarUploadDir()
  await mkdir(dir, { recursive: true })

  const filename = `${sanitizePathSegment(id, 'cmoon')}-${Date.now()}.webp`
  const outPath = assertInside(dir, cmoonAvatarFsPath(filename))
  await writeFile(outPath, output)
  const newAvatarPath = cmoonAvatarPublicPath(filename)

  const oldAvatarPath = cmoon.avatarPath
  await db.cMoon.update({ where: { id }, data: { avatarPath: newAvatarPath } })
  invalidateCMoonList()

  if (oldAvatarPath) {
    const oldFilename = oldAvatarPath.split('/').pop()
    if (oldFilename) { try { await unlink(cmoonAvatarFsPath(oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'cMoon', key: `avatarImage:${id}`, prevValue: oldAvatarPath, newValue: newAvatarPath,
  })

  return { id, avatarPath: newAvatarPath }
})

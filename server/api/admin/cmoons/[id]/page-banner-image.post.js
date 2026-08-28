// server/api/admin/cmoons/[id]/page-banner-image.post.js
//
// Uploads the wide masthead banner shown at the top of this cMoon's own page
// (/newsite/cmoon/[id]) — distinct from the small button (button-image.post.js, shown on cToon ID
// cards and other cMoons' pages) and from the 800x600 pageImagePath (no longer displayed). Same
// normalize-then-store approach as the other cMoon image endpoints.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, sanitizePathSegment, assertInside } from '@/server/utils/imageUploadValidation'
import { cmoonPageBannerUploadDir, cmoonPageBannerFsPath, cmoonPageBannerPublicPath } from '@/server/utils/cmoonImageStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

// Thin masthead strip (~12:1) — matches the reference asset's proportions. The page renders this
// with a CSS height clamp rather than a locked aspect-ratio box (see CMoonPage.vue), so admins
// should keep any important name/logo art centered in the middle of the banner — the edges are
// what gets cropped first on a narrow phone screen.
const BANNER_WIDTH = 1200
const BANNER_HEIGHT = 100
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
      .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
  }

  const dir = cmoonPageBannerUploadDir()
  await mkdir(dir, { recursive: true })

  const filename = `${sanitizePathSegment(id, 'cmoon')}-${Date.now()}.webp`
  const outPath = assertInside(dir, cmoonPageBannerFsPath(filename))
  await writeFile(outPath, output)
  const newPath = cmoonPageBannerPublicPath(filename)

  const oldPath = cmoon.pageBannerImagePath
  await db.cMoon.update({ where: { id }, data: { pageBannerImagePath: newPath } })
  invalidateCMoonList()

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(cmoonPageBannerFsPath(oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'cMoon', key: `pageBannerImage:${id}`, prevValue: oldPath, newValue: newPath,
  })

  return { id, pageBannerImagePath: newPath }
})

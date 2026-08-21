// server/api/admin/cmoons/[id]/banner-image.post.js
//
// Uploads the small wide banner graphic shown on a themed cToon modal in
// place of the plain "cWorld" text tile. Same normalize-then-store approach
// as page-image.post.js (auto-orient, cover-crop to a fixed size, re-encode
// via sharp) rather than trusting/storing the upload as-is — see that file's
// header comment for why this deliberately isn't a copy of
// server/api/admin/backgrounds.post.js.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { sniffImageType, sanitizePathSegment, assertInside, MAX_IMAGE_BYTES } from '@/server/utils/imageUploadValidation'
import { cmoonBannerUploadDir, cmoonBannerFsPath, cmoonBannerPublicPath } from '@/server/utils/cmoonImageStorage'

// Wide banner strip (4:1) — big enough to look crisp across the modal's
// full-width tile on desktop, small enough that it's clearly a "small
// banner graphic" and not competing with the 800x600 cMoon page image.
const BANNER_WIDTH = 800
const BANNER_HEIGHT = 200

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = id ? await db.cMoon.findUnique({ where: { id } }) : null
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })

  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller.' })
  }

  const sniffed = sniffImageType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF, or WebP images are allowed.' })
  }

  let output
  try {
    output = await sharp(filePart.data)
      .rotate()
      .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image.' })
  }

  const uploadDir = cmoonBannerUploadDir()
  await mkdir(uploadDir, { recursive: true })
  const filename = `${sanitizePathSegment(id, 'cmoon')}-${Date.now()}.webp`
  const outPath = assertInside(uploadDir, cmoonBannerFsPath(filename))
  await writeFile(outPath, output)

  const imagePath = cmoonBannerPublicPath(filename)

  await db.cMoon.update({
    where: { id },
    data: { bannerImagePath: imagePath }
  })

  await logAdminChange(db, {
    userId: me.id,
    area: `cMoon:${id}`,
    key: 'bannerImagePath',
    prevValue: cmoon.bannerImagePath,
    newValue: imagePath
  }).catch(() => {})

  return { bannerImagePath: imagePath }
})

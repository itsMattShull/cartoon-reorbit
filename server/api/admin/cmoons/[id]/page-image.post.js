// server/api/admin/cmoons/[id]/page-image.post.js
//
// Uploads a cMoon page image, normalized to exactly 800x600 (the same
// resolution as a cZone background). Rather than rejecting anything that
// isn't already pixel-exact (which a phone camera essentially never is),
// this auto-orients (EXIF) and center-crops/resizes to 800x600 server-side
// via sharp, then re-encodes — which also means the stored file is never the
// attacker-controlled bytes as-uploaded.
//
// Deliberately NOT a copy of server/api/admin/backgrounds.post.js: that file
// imports sniffImageType/MAX_IMAGE_BYTES but never calls them, and has no
// size cap or path-containment check. This endpoint calls every primitive
// itemized below, in order, before any file I/O.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { sniffImageType, sanitizePathSegment, assertInside, MAX_IMAGE_BYTES } from '@/server/utils/imageUploadValidation'
import { cmoonPageUploadDir, cmoonPageFsPath, cmoonPagePublicPath } from '@/server/utils/cmoonImageStorage'

const PAGE_IMAGE_WIDTH = 800
const PAGE_IMAGE_HEIGHT = 600

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

  // The multipart "type" field is client-supplied and spoofable — verify
  // from the actual bytes before doing anything with the file.
  const sniffed = sniffImageType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF, or WebP images are allowed.' })
  }

  let output
  try {
    output = await sharp(filePart.data)
      .rotate() // auto-orient per EXIF before anything else touches pixel data
      .resize(PAGE_IMAGE_WIDTH, PAGE_IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image.' })
  }

  const uploadDir = cmoonPageUploadDir()
  await mkdir(uploadDir, { recursive: true })
  const filename = `${sanitizePathSegment(id, 'cmoon')}-${Date.now()}.webp`
  const outPath = assertInside(uploadDir, cmoonPageFsPath(filename))
  await writeFile(outPath, output)

  const imagePath = cmoonPagePublicPath(filename)

  await db.cMoon.update({
    where: { id },
    data: {
      pageImagePath: imagePath,
      pageImageWidth: PAGE_IMAGE_WIDTH,
      pageImageHeight: PAGE_IMAGE_HEIGHT
    }
  })

  await logAdminChange(db, {
    userId: me.id,
    area: `cMoon:${id}`,
    key: 'pageImagePath',
    prevValue: cmoon.pageImagePath,
    newValue: imagePath
  }).catch(() => {})

  return { pageImagePath: imagePath }
})

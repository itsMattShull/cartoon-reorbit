// server/api/admin/cmoons/[id]/button-image.post.js
//
// Uploads the small pill-shaped button graphic shown on a themed cToon modal in place of the
// plain "cWorld" text tile, and — if showButtonOnPages is on for this cMoon — in the button-pill
// list on other cMoons' pages too. Was previously a full-width 800x200 banner (see the migration
// that renamed CMoon.bannerImagePath to buttonImagePath); same normalize-then-store approach as
// page-image.post.js (auto-orient, cover-crop to a fixed size, re-encode via sharp) rather than
// trusting/storing the upload as-is.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { sniffImageType, sanitizePathSegment, assertInside, MAX_IMAGE_BYTES } from '@/server/utils/imageUploadValidation'
import { cmoonButtonUploadDir, cmoonButtonFsPath, cmoonButtonPublicPath } from '@/server/utils/cmoonImageStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

// Small pill button (~3.74:1) — sized to the reference asset at 2x for a crisp look on retina
// displays while staying clearly a small button, not competing with the 800x600 cMoon page image.
const BUTTON_WIDTH = 232
const BUTTON_HEIGHT = 62

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
      .resize(BUTTON_WIDTH, BUTTON_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image.' })
  }

  const uploadDir = cmoonButtonUploadDir()
  await mkdir(uploadDir, { recursive: true })
  const filename = `${sanitizePathSegment(id, 'cmoon')}-${Date.now()}.webp`
  const outPath = assertInside(uploadDir, cmoonButtonFsPath(filename))
  await writeFile(outPath, output)

  const imagePath = cmoonButtonPublicPath(filename)

  await db.cMoon.update({
    where: { id },
    data: { buttonImagePath: imagePath }
  })
  invalidateCMoonList()

  await logAdminChange(db, {
    userId: me.id,
    area: `cMoon:${id}`,
    key: 'buttonImagePath',
    prevValue: cmoon.buttonImagePath,
    newValue: imagePath
  }).catch(() => {})

  return { buttonImagePath: imagePath }
})

// server/api/admin/cmoon-enemy-factions/[id]/image.post.js
// Uploads (or replaces) an enemy faction's banner — shown in the admin list and behind the
// member's own portrait in the battle popup. Kept as its own multipart endpoint, same split
// rationale as server/api/admin/cmoons/[id]/image.post.js.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, resizeAnimatedGif } from '@/server/utils/imageUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-enemy-factions'
// `fit: 'cover'` into a fixed 3:1 box, following the cMoon poster upload
// (server/api/admin/cmoons/[id]/image.post.js) rather than the join-effect upload's 'contain':
// this banner is a BACKDROP filling the popup's header area behind the member portrait, so it has
// to reach every edge of that box — a letterboxed 'contain' result would leave transparent/empty
// strips around it on any non-3:1 source. The trade-off is the usual one for a backdrop (the
// edges of an off-ratio upload get cropped), softened by `position: 'attention'` on static images;
// the member portrait on top is the art that must never be cropped (see
// cmoon-enemy-members/[id]/image.post.js). A fixed box (vs. page-banner-image.post.js's
// keep-your-own-proportions approach) keeps the popup's layout identical for every faction.
const OUTPUT_WIDTH = 1200
const OUTPUT_HEIGHT = 400
// The battle popup appears site-wide while browsing, so animated banners get a tighter frame cap
// than resizeAnimatedGif's default — same reasoning as the join-effect upload's GIF_MAX_FRAMES.
const GIF_MAX_FRAMES = 90
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const faction = await db.cMoonEnemyFaction.findUnique({ where: { id } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

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
      ? await resizeAnimatedGif(filePart.data, OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'cover', maxFrames: GIF_MAX_FRAMES })
      : await sharp(filePart.data, { limitInputPixels: 40_000_000 })
          .timeout({ seconds: 15 })
          .resize({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, fit: 'cover', position: 'attention' })
          .webp({ quality: 85 })
          .toBuffer()
  } catch (err) {
    const message = /too many frames/.test(err?.message || '') ? err.message : 'Could not process that image'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })

  // Server-generated name only — never the client's filename or extension.
  const filename = `cmoon-enemy-faction-${id}-${Date.now()}.${isGif ? 'gif' : 'webp'}`
  await writeFile(uploadFsPath(FEATURE, filename), output)
  const newImagePath = uploadPublicPath(FEATURE, filename)

  const oldImagePath = faction.bannerImagePath
  await db.cMoonEnemyFaction.update({ where: { id }, data: { bannerImagePath: newImagePath } })

  if (oldImagePath) {
    const oldFilename = oldImagePath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonEnemyFaction', key: `image:${id}`, prevValue: oldImagePath, newValue: newImagePath,
  })

  return { id, bannerImagePath: newImagePath }
})

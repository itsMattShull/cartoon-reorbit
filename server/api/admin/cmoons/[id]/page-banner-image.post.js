// server/api/admin/cmoons/[id]/page-banner-image.post.js
//
// Uploads the wide masthead banner shown at the top of this cMoon's own page
// (/newsite/cmoon/[id]) — distinct from the small button (button-image.post.js, shown on cToon ID
// cards and other cMoons' pages) and from the 800x600 pageImagePath (no longer displayed). Same
// normalize-then-store approach as the other cMoon image endpoints.
//
// Unlike the other cMoon image endpoints, this one does NOT force a fixed output size — admins
// asked for banners to render at their own uploaded proportions instead of being center-cropped
// to a fixed box. Uploads are only ever scaled DOWN (never cropped, never upscaled) if they
// exceed MAX_WIDTH/MAX_HEIGHT, and the actual resulting pixel dimensions are stored alongside the
// path so CMoonPage.vue can size the masthead box (via CSS aspect-ratio) without layout shift.
// An aspect-ratio band is still enforced server-side: without it, a pathological upload (e.g.
// 1x8000) would get stored as legitimate-looking dimensions and produce a masthead that's mostly
// empty page height on every visit — this is a rejection at upload time, not a silent crop/pad.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType, sanitizePathSegment, assertInside, resizeAnimatedGif } from '@/server/utils/imageUploadValidation'
import { cmoonPageBannerUploadDir, cmoonPageBannerFsPath, cmoonPageBannerPublicPath } from '@/server/utils/cmoonImageStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

// Max box a banner is downscaled to fit inside (aspect ratio preserved, never upscaled, never
// cropped) — generous enough for a genuinely wide masthead without letting a single upload bloat
// page-load weight on every cMoon page visit (this image is never behind the 30s list cache).
const MAX_WIDTH = 1600
const MAX_HEIGHT = 400
// Banners are a masthead strip, not a poster — reject anything that isn't recognizably
// wide-format rather than silently storing (and rendering) a degenerate shape.
const MIN_ASPECT_RATIO = 2 // at least twice as wide as tall
const MAX_ASPECT_RATIO = 20 // no more than a 20:1 sliver
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024

async function measureFrame(buffer, isGif) {
  const meta = await sharp(buffer, isGif ? { animated: true, limitInputPixels: 40_000_000 } : { limitInputPixels: 40_000_000 }).metadata()
  let width = meta.width
  let height = isGif ? (meta.pageHeight || meta.height) : meta.height
  // EXIF-rotated (90°/270°) stills swap dimensions once .rotate() auto-orients them below —
  // measure post-rotation size up front so the aspect-ratio check and resize target agree with
  // what actually gets written. GIFs don't carry this EXIF tag, so this only applies to stills.
  if (!isGif && meta.orientation >= 5 && meta.orientation <= 8) {
    ;[width, height] = [height, width]
  }
  return { width, height }
}

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
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF, or WebP images are allowed' })
  }

  const isGif = sniffed === 'image/gif'

  let srcWidth, srcHeight
  try {
    ;({ width: srcWidth, height: srcHeight } = await measureFrame(filePart.data, isGif))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not read that image' })
  }
  if (!srcWidth || !srcHeight) {
    throw createError({ statusCode: 400, statusMessage: 'Could not read that image' })
  }
  const ratio = srcWidth / srcHeight
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) {
    throw createError({
      statusCode: 400,
      statusMessage: `Banner must be a wide masthead shape, between ${MIN_ASPECT_RATIO}:1 and ${MAX_ASPECT_RATIO}:1 (this image is about ${ratio.toFixed(2)}:1). Crop it wider before uploading.`,
    })
  }

  // Downscale-only: never enlarge a smaller-than-max upload, never crop — both axes scale by the
  // same factor so the stored image's aspect ratio exactly matches the original.
  const scale = Math.min(1, MAX_WIDTH / srcWidth, MAX_HEIGHT / srcHeight)
  const outWidth = Math.max(1, Math.round(srcWidth * scale))
  const outHeight = Math.max(1, Math.round(srcHeight * scale))

  let output
  try {
    output = isGif
      ? await resizeAnimatedGif(filePart.data, outWidth, outHeight, { fit: 'fill' })
      : await sharp(filePart.data, { limitInputPixels: 40_000_000 })
          .timeout({ seconds: 15 })
          .rotate()
          .resize(outWidth, outHeight, { fit: 'fill' })
          .webp({ quality: 85 })
          .toBuffer()
  } catch (err) {
    const message = /too many frames/.test(err?.message || '') ? err.message : 'Could not process that image'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const dir = cmoonPageBannerUploadDir()
  await mkdir(dir, { recursive: true })

  const filename = `${sanitizePathSegment(id, 'cmoon')}-${Date.now()}.${isGif ? 'gif' : 'webp'}`
  const outPath = assertInside(dir, cmoonPageBannerFsPath(filename))
  await writeFile(outPath, output)
  const newPath = cmoonPageBannerPublicPath(filename)

  const oldPath = cmoon.pageBannerImagePath
  await db.cMoon.update({
    where: { id },
    data: { pageBannerImagePath: newPath, pageBannerWidth: outWidth, pageBannerHeight: outHeight },
  })
  invalidateCMoonList()

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(cmoonPageBannerFsPath(oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'cMoon', key: `pageBannerImage:${id}`, prevValue: oldPath, newValue: newPath,
  })

  return { id, pageBannerImagePath: newPath, pageBannerWidth: outWidth, pageBannerHeight: outHeight }
})

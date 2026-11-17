// Shared multipart-image-upload processing for the MyOrbit art libraries (MyOrbitTile,
// MyOrbitFurniture) — four nearly-identical upload routes (tile/furniture x create/update) would
// otherwise each reimplement this exact sniff-validate-resize block. Mirrors the shape every
// other admin art upload in this codebase already follows (e.g.
// server/api/admin/cmoon-enemy-members/[id]/image.post.js), just factored out since this
// feature's four call sites all land in the same PR rather than being retrofitted onto already-
// shipped, separately-evolving code.
import { createError } from 'h3'
import sharp from 'sharp'
import { MAX_IMAGE_BYTES, sniffImageType, resizeAnimatedGif } from '@/server/utils/imageUploadValidation'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_MYORBIT_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * Validates and resizes an uploaded image's raw bytes into a square, transparent-letterboxed
 * buffer (webp for static images, gif for animated ones — animation is kept, never flattened to
 * a single frame, since an admin may intentionally upload an animated tile/furniture piece).
 * Throws an h3 createError with a user-facing statusMessage on any failure — callers can let it
 * propagate straight out of their route handler.
 */
export async function processMyOrbitArtUpload(buffer, { staticOutput, gifOutput, gifMaxFrames = 90 } = {}) {
  if (!buffer || buffer.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  // Bytes are sniffed, never trusted from the client-declared type/filename.
  const sniffed = sniffImageType(buffer)
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF, or WebP images are allowed' })
  }

  const isGif = sniffed === 'image/gif'
  try {
    const output = isGif
      ? await resizeAnimatedGif(buffer, gifOutput, gifOutput, { fit: 'contain', background: TRANSPARENT, maxFrames: gifMaxFrames })
      : await sharp(buffer, { limitInputPixels: 40_000_000 })
          .timeout({ seconds: 15 })
          .ensureAlpha()
          .resize({ width: staticOutput, height: staticOutput, fit: 'contain', background: TRANSPARENT })
          .webp({ quality: 90 })
          .toBuffer()
    return { output, ext: isGif ? 'gif' : 'webp' }
  } catch (err) {
    const message = /too many frames/.test(err?.message || '') ? err.message : 'Could not process that image'
    throw createError({ statusCode: 400, statusMessage: message })
  }
}

/** Splits h3 multipart parts into `{ fields, filePart }` — the one file part (if any) is the
 * part with a `filename`; everything else is a plain text field. Same split
 * server/api/admin/backgrounds.post.js already does inline. */
export function splitMultipartParts(parts) {
  const fields = {}
  let filePart = null
  for (const part of parts || []) {
    if (part.filename) filePart = part
    else fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
  }
  return { fields, filePart }
}

// server/utils/imageUploadValidation.js
import { resolve as resolvePath, sep as pathSep } from 'node:path'
import sharp from 'sharp'
// Shared image-upload validation: size cap, magic-byte content sniffing (the
// multipart "type" field is client-supplied and spoofable, so declared mime
// type alone is not trusted), and filename sanitization against path
// traversal.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB

// sharp decodes every frame of an animated GIF into one tall strip before resizing, so the
// 5MB *input* cap alone doesn't bound decoded memory/CPU cost — a small file can still carry an
// unreasonable number of frames. This caps frames independently of file size.
export const MAX_ANIMATED_FRAMES = 200

/**
 * Resize an animated GIF frame-by-frame to a fixed size, keeping it animated.
 * sharp/libvips doesn't support entropy/attention gravity for multi-page (animated) input
 * ("Resize strategy is not supported for multi-page images"), so animated crops are always
 * centered — callers doing entropy-based cropping for static images are unaffected.
 *
 * `maxFrames` defaults to MAX_ANIMATED_FRAMES but can be tightened per call site — a caller that
 * plays the GIF full-screen and forced-autoplay on a high-frequency path (e.g. cMoon join
 * effects) wants a stricter cap than one that shows it small/lazy-loaded (e.g. a thumbnail grid).
 * `background` is passed straight through to sharp's resize for `fit: 'contain'` callers that
 * need transparent (rather than opaque black) letterbox padding — omitted, sharp's own default
 * applies, so existing callers are unaffected.
 */
export async function resizeAnimatedGif(buffer, width, height, { fit = 'cover', limitInputPixels = 40_000_000, maxFrames = MAX_ANIMATED_FRAMES, background } = {}) {
  const image = sharp(buffer, { animated: true, limitInputPixels })
  const { pages } = await image.metadata()
  if ((pages || 1) > maxFrames) {
    throw new Error(`Animated image has too many frames (max ${maxFrames})`)
  }
  return image
    .timeout({ seconds: 15 })
    .resize(width, height, { fit, position: 'centre', ...(background ? { background } : {}) })
    .gif()
    .toBuffer()
}

const SIGNATURES = [
  { type: 'image/png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
]

export function sniffImageType(buf) {
  if (!buf || buf.length < 4) return null
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  for (const sig of SIGNATURES) {
    if (buf.length >= sig.bytes.length && sig.bytes.every((b, i) => buf[i] === b)) {
      return sig.type
    }
  }
  return null
}

export function sanitizeFilename(name) {
  return String(name || 'image').replace(/[^A-Za-z0-9._-]/g, '') || 'image'
}

/**
 * Sanitize a single path segment used as a directory name (e.g. a cToon
 * series). `path.join` resolves `..` eagerly, so an unsanitized segment escapes
 * the upload root entirely: join('/app/public/cToons', '../../../../etc')
 * is '/etc'. Strips separators and dot-runs, then falls back to a safe literal.
 */
export function sanitizePathSegment(name, fallback = 'misc') {
  const cleaned = String(name || '')
    .replace(/[\\/]/g, '')
    .replace(/\.{2,}/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .trim()
  return cleaned && cleaned !== '.' ? cleaned : fallback
}

/**
 * Final containment check before writing. Belt-and-braces on top of the
 * sanitizers: if a destination ever resolves outside its intended root, fail
 * loudly rather than writing.
 */
export function assertInside(root, candidate) {
  const rootResolved = resolvePath(root)
  const target = resolvePath(candidate)
  if (target !== rootResolved && !target.startsWith(rootResolved + pathSep)) {
    throw new Error(`Refusing to write outside upload root: ${target}`)
  }
  return target
}

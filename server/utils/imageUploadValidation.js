// server/utils/imageUploadValidation.js
// Shared image-upload validation: size cap, magic-byte content sniffing (the
// multipart "type" field is client-supplied and spoofable, so declared mime
// type alone is not trusted), and filename sanitization against path
// traversal.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB

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

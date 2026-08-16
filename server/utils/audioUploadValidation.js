// server/utils/audioUploadValidation.js
//
// Magic-byte validation for uploaded audio, and the extension that gets written to disk.
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────
// server/api/admin/winwheel-sound.post.js — the only audio-upload precedent in the repo —
// validates against `filePart.type` (the client-supplied multipart Content-Type, freely
// spoofable) and derives the saved file's extension from `extname(filePart.filename)` (also
// client-supplied). Neither is a check. Prod serves the upload directory from nginx, which
// picks Content-Type from the extension, so a request declaring `audio/mpeg` while naming its
// file `x.html` writes an HTML document that is then served as text/html from the app's own
// origin. There is no CSP on this site (nuxt.config.js sets no security headers at all), so
// that is stored XSS with full session access, not a curiosity.
//
// The rule here is the same one server/utils/imageUploadValidation.js follows: the type comes
// from the bytes, the extension comes from the sniffed type, and NOTHING the client sent
// reaches the filename.
//
// Every sniffer below rejects the "header prefix is enough" shortcut, because for audio it
// very much is not — see the ID3 note.

export const MAX_AUDIO_BYTES = 3 * 1024 * 1024 // 3MB

// One extension per sniffed type. This map is the only source of extensions; there is no path
// by which a client string becomes one.
const EXT_BY_TYPE = {
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav'
}

export const audioExtFor = (type) => EXT_BY_TYPE[type] || null
export const ALLOWED_AUDIO_TYPES = Object.freeze(Object.keys(EXT_BY_TYPE))

/**
 * True if an MPEG audio frame header starts at `off`.
 *
 * `0xFF 0xEx` alone is not sufficient — a pair of 0xFF bytes is trivially embeddable in
 * arbitrary content — so the reserved encodings are rejected too: version 01, layer 00,
 * bitrate index 1111 and sample-rate index 11 are all "reserved" and never appear in a real
 * frame.
 */
function isMpegFrame(buf, off) {
  if (off + 4 > buf.length) return false
  const b0 = buf[off], b1 = buf[off + 1], b2 = buf[off + 2]
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return false
  if (((b1 >> 3) & 0x03) === 1) return false // reserved MPEG version
  if (((b1 >> 1) & 0x03) === 0) return false // reserved layer
  if ((b2 >> 4) === 0x0f) return false       // bad bitrate index
  if (((b2 >> 2) & 0x03) === 3) return false // reserved sample rate
  return true
}

/**
 * MP3, both framings.
 *
 * The ID3v2 case is the one that gets botched: `buf.slice(0,3) === 'ID3'` is NOT a validation.
 * "ID3" + a 10-byte header + 30KB of HTML passes it. The tag's size field must be parsed
 * (four syncsafe bytes, 7 significant bits each) and an actual MPEG frame verified at the far
 * side of it.
 */
function isMp3(buf) {
  if (buf.length < 4) return false

  if (buf.toString('ascii', 0, 3) === 'ID3') {
    if (buf.length < 10) return false
    const flags = buf[5]
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) |
                 ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    let off = 10 + size
    if (flags & 0x10) off += 10 // footer present
    // Real encoders sometimes leave a few padding bytes before the first frame.
    for (let i = off; i < Math.min(off + 8, buf.length - 4); i++) {
      if (isMpegFrame(buf, i)) return true
    }
    return false
  }

  return isMpegFrame(buf, 0)
}

/**
 * Ogg. `OggS` alone also matches Ogg-Theora and Ogg-Skeleton, which are containers that can
 * carry arbitrary streams, so the first page's codec identifier is checked too.
 */
function isOgg(buf) {
  if (buf.length < 35) return false
  if (buf.toString('ascii', 0, 4) !== 'OggS') return false
  if (buf[4] !== 0x00) return false // stream structure version
  const head = buf.subarray(27, 35)
  return head.toString('binary', 1, 7) === 'vorbis' ||
         head.toString('ascii', 0, 8) === 'OpusHead' ||
         head.toString('binary', 0, 5) === '\x7fFLAC'
}

/**
 * WAV. Note the collision hazard: sniffImageType() in imageUploadValidation.js keys WebP on
 * `RIFF` at 0 plus `WEBP` at 8 — the same offsets. A sniffer that returned on `RIFF` alone
 * would let a WebP through the audio path and a WAV through the image path, so the form type
 * at 8..12 is mandatory, not decorative.
 */
function isWav(buf) {
  if (buf.length < 16) return false
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return false
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return false
  if (buf.toString('ascii', 12, 16) !== 'fmt ') return false
  // The RIFF size field should describe the payload. A gross mismatch is where appended
  // polyglot payloads live, so allow slack for trailing metadata but reject the absurd.
  const riffSize = buf.readUInt32LE(4)
  if (riffSize + 8 > buf.length + 1024) return false
  return true
}

/**
 * Returns 'audio/mpeg' | 'audio/ogg' | 'audio/wav', or null if the bytes are not one of those.
 * The client's declared MIME type is never consulted — not even as a secondary check, because
 * keeping it around invites a later edit that loosens the real one.
 */
export function sniffAudioType(buf) {
  if (!buf || buf.length < 16) return null
  if (isMp3(buf)) return 'audio/mpeg'
  if (isOgg(buf)) return 'audio/ogg'
  if (isWav(buf)) return 'audio/wav'
  return null
}

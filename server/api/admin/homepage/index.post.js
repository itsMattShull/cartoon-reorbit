// server/api/admin/homepage/index.post.js
import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { sanitizeLink } from '@/server/utils/sanitizeLink'
import { uploadDir as sharedUploadDir, uploadPublicPath as sharedUploadPublicPath } from '@/server/utils/uploadStorage'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// Legacy slots (topLeft/bottomLeft/topRight/showcase/homeImage*/middleSidebar*/news/earnPoints/label,
// and the still-live bottomRight "Bottom Spotlight" shared with WinballPromo.vue) keep the original,
// broader allow-list for backward compatibility with content admins already uploaded.
const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/svg+xml','image/gif','video/mp4'])

// New hero-redesign image slots deliberately exclude SVG — an uploaded SVG can carry <script>,
// and if a "link to" field ever points straight at the file's own same-origin path, navigating to
// it would execute that script. Same reasoning already applied to the favicon uploader.
const ALLOWED_NEW_IMAGE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif'])
const ALLOWED_VIDEO = new Set(['video/mp4'])

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB
const MAX_VIDEO_BYTES = 150 * 1024 * 1024 // 150MB
const MAX_INPUT_PIXELS = 30_000_000 // guards against decompression-bomb-style crafted images
const HERO_IMAGE_MAX_WIDTH = 1600 // bounds worst-case payload for the highest-traffic page

const publicAssetPath = (filename) =>
  process.env.NODE_ENV === 'production' ? `/images/homepage/${filename}` : `/homepage/${filename}`

// New fields route their dev/prod path split through the shared helper instead of copy-pasting
// the inline logic above a fourth time; they still land in the same "homepage" bucket as the
// legacy fields since they're the same conceptual asset set.
const newUploadDir = () => sharedUploadDir('homepage')
const newPublicAssetPath = (filename) => sharedUploadPublicPath('homepage', filename)

export default defineEventHandler(async (event) => {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // parse multipart
  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const text = {}
  const files = {}
  for (const p of parts) {
    if (p.filename) files[p.name] = p
    else text[p.name] = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
  }

  // get current values first so missing fields are NOT overwritten
  const current = await db.homepageConfig.findUnique({ where: { id: 'homepage' } }) ?? {
    id: 'homepage',
    topLeftImagePath:        null,
    bottomLeftImagePath:     null,
    topRightImagePath:       null,
    bottomRightImagePath:    null,
    bottomRightLink:         null,
    showcaseImagePath:       null,
    heroImagePath:           null,
    heroImageLink:           null,
    heroVideoPath:           null,
    loginTopImagePath:       null,
    loginTopImageLink:       null,
    loginBottomImagePath:    null,
    loginBottomImageLink:    null,
    middleSidebar1ImagePath: null,
    middleSidebar1Link:      null,
    middleSidebar2ImagePath: null,
    middleSidebar2Link:      null,
    middleSidebar3ImagePath: null,
    middleSidebar3Link:      null,
    newsImagePath:           null,
    earnPointsImagePath:     null,
    labelImagePath:          null
  }

  // fs prep (legacy slots)
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'homepage')
    : join(baseDir, 'public', 'homepage')
  await mkdir(uploadDir, { recursive: true })

  async function saveIfPresent(key) {
    const part = files[key]
    if (!part) return null
    if (!ALLOWED.has(part.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid file type for ${key}` })
    }
    const isVideo = part.type === 'video/mp4'
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (!part.data || part.data.length > maxBytes) {
      throw createError({ statusCode: 400, statusMessage: `${key} exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit` })
    }
    const ext = extname(part.filename || '').toLowerCase() ||
      (part.type === 'image/svg+xml' ? '.svg' : part.type === 'image/png' ? '.png' : part.type === 'image/gif' ? '.gif' : part.type === 'video/mp4' ? '.mp4' : '.jpg')
    const ts = Date.now()
    const filename = `${key}-${ts}${ext}`
    const dest = join(uploadDir, filename)
    await writeFile(dest, part.data)
    // If this is an mp4, attempt to generate a poster image using ffmpeg (optional).
    // Poster will be named with the same base but .jpg so frontend can discover it.
    if (ext === '.mp4') {
      try {
        const posterName = `${key}-${ts}.jpg`
        const posterDest = join(uploadDir, posterName)
        const args = ['-ss', '00:00:01', '-i', dest, '-frames:v', '1', '-q:v', '2', posterDest]
        const res = spawnSync('ffmpeg', args, { stdio: 'ignore' })
        if (res.status === 0) {
          // poster generated successfully
        }
      } catch (e) {
        // ignore poster generation failures
      }
    }
    return publicAssetPath(filename)
  }

  // New hero-redesign image slots: raster-only, size-capped, and re-encoded through sharp both to
  // bound the worst-case payload on the site's highest-traffic page and as a basic content check —
  // sharp fails closed on anything it can't actually decode as an image, which catches a spoofed
  // Content-Type header (a non-image file declared as image/png, etc).
  async function saveNewImageIfPresent(key) {
    const part = files[key]
    if (!part) return null
    if (!ALLOWED_NEW_IMAGE.has(part.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid file type for ${key} — PNG, JPG, or GIF only` })
    }
    if (!part.data || part.data.length > MAX_IMAGE_BYTES) {
      throw createError({ statusCode: 400, statusMessage: `${key} exceeds the ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB limit` })
    }

    const dir = newUploadDir()
    await mkdir(dir, { recursive: true })
    const ts = Date.now()

    // Animated GIFs can't be resized through sharp without collapsing to a single frame, so pass
    // them through as-is (still MIME/size/decode-validated above via the allow-list + cap).
    if (part.type === 'image/gif') {
      const filename = `${key}-${ts}.gif`
      await writeFile(join(dir, filename), part.data)
      return newPublicAssetPath(filename)
    }

    let outBuffer, outExt
    try {
      const oriented = await sharp(part.data, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer()
      const meta = await sharp(oriented).metadata()
      if (!meta.width || !meta.height) throw new Error('no dimensions')
      const pipeline = sharp(oriented).resize({ width: HERO_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      if (part.type === 'image/png') {
        outBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer()
        outExt = '.png'
      } else {
        outBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer()
        outExt = '.jpg'
      }
    } catch {
      throw createError({ statusCode: 400, statusMessage: `Could not read ${key} — file may be corrupt, too large, or an unsupported format.` })
    }

    const filename = `${key}-${ts}${outExt}`
    await writeFile(join(dir, filename), outBuffer)
    return newPublicAssetPath(filename)
  }

  async function saveVideoIfPresent(key) {
    const part = files[key]
    if (!part) return null
    if (!ALLOWED_VIDEO.has(part.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid file type for ${key} — MP4 only` })
    }
    if (!part.data || part.data.length > MAX_VIDEO_BYTES) {
      throw createError({ statusCode: 400, statusMessage: `${key} exceeds the ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB limit` })
    }

    const dir = newUploadDir()
    await mkdir(dir, { recursive: true })
    const ts = Date.now()
    const filename = `${key}-${ts}.mp4`
    const dest = join(dir, filename)
    await writeFile(dest, part.data)

    try {
      const posterName = `${key}-${ts}.jpg`
      const posterDest = join(dir, posterName)
      spawnSync('ffmpeg', ['-ss', '00:00:01', '-i', dest, '-frames:v', '1', '-q:v', '2', posterDest], { stdio: 'ignore' })
    } catch (e) {
      // ignore poster generation failures
    }

    return newPublicAssetPath(filename)
  }

  const saved = {
    topLeft:          await saveIfPresent('topLeft'),
    bottomLeft:       await saveIfPresent('bottomLeft'),
    topRight:         await saveIfPresent('topRight'),
    bottomRight:      await saveIfPresent('bottomRight'),
    showcase:         await saveIfPresent('showcase'),
    homeImage1:       await saveIfPresent('homeImage1'),
    homeImage2:       await saveIfPresent('homeImage2'),
    homeImage3:       await saveIfPresent('homeImage3'),
    homeImage4:       await saveIfPresent('homeImage4'),
    middleSidebar1:   await saveIfPresent('middleSidebar1'),
    middleSidebar2:   await saveIfPresent('middleSidebar2'),
    middleSidebar3:   await saveIfPresent('middleSidebar3'),
    news:             await saveIfPresent('news'),
    earnPoints:       await saveIfPresent('earnPoints'),
    label:            await saveIfPresent('label'),
    heroImage:        await saveNewImageIfPresent('heroImage'),
    loginTop:         await saveNewImageIfPresent('loginTop'),
    loginBottom:      await saveNewImageIfPresent('loginBottom'),
    heroVideo:        await saveVideoIfPresent('heroVideo')
  }

  // helper: update one slot without touching others unless provided
  const has = (k) => Object.prototype.hasOwnProperty.call(text, k)
  const norm = (v) => (v ?? '').toString().trim()

  function resolveSlot(slotKey, fileKey, textKey, currentValue) {
    // 1) new upload wins
    if (saved[fileKey] != null) return saved[fileKey]
    // 2) explicit field present in form
    if (has(textKey)) {
      const val = norm(text[textKey])
      // empty string = clear
      if (val === '') return null
      // non-empty string = keep provided path (usually echoes current)
      return val
    }
    // 3) field absent = leave unchanged
    return currentValue
  }

  // Link fields are echoed back as real `<a href>` targets on the public, unauthenticated
  // homepage — sanitizeLink rejects anything but http(s)/relative paths (blocks javascript:/data:
  // etc. stored XSS). Applied to every link field, not just the new ones: this endpoint has never
  // validated these server-side, so it's a pre-existing gap on fields already exposed publicly.
  const resolveLink = (textKey, currentValue) => {
    if (has(textKey)) {
      const val = norm(text[textKey])
      if (val === '') return null
      const clean = sanitizeLink(val)
      if (clean === null) {
        throw createError({ statusCode: 400, statusMessage: `${textKey} must be a relative path or an http(s) URL` })
      }
      return clean
    }
    return currentValue
  }

  const next = {
    topLeftImagePath:     resolveSlot('topLeftImagePath',     'topLeft',     'topLeftPath',     current.topLeftImagePath),
    bottomLeftImagePath:  resolveSlot('bottomLeftImagePath',  'bottomLeft',  'bottomLeftPath',  current.bottomLeftImagePath),
    topRightImagePath:    resolveSlot('topRightImagePath',    'topRight',    'topRightPath',    current.topRightImagePath),
    bottomRightImagePath: resolveSlot('bottomRightImagePath', 'bottomRight', 'bottomRightPath', current.bottomRightImagePath),
    bottomRightLink:      resolveLink('bottomRightLink', current.bottomRightLink),
    showcaseImagePath:    resolveSlot('showcaseImagePath',    'showcase',    'showcasePath',    current.showcaseImagePath),
    heroImagePath:        resolveSlot('heroImagePath',        'heroImage',   'heroImagePath',   current.heroImagePath),
    heroImageLink:        resolveLink('heroImageLink', current.heroImageLink),
    heroVideoPath:        resolveSlot('heroVideoPath',        'heroVideo',   'heroVideoPath',   current.heroVideoPath),
    loginTopImagePath:    resolveSlot('loginTopImagePath',    'loginTop',    'loginTopImagePath',    current.loginTopImagePath),
    loginTopImageLink:    resolveLink('loginTopImageLink', current.loginTopImageLink),
    loginBottomImagePath: resolveSlot('loginBottomImagePath', 'loginBottom', 'loginBottomImagePath', current.loginBottomImagePath),
    loginBottomImageLink: resolveLink('loginBottomImageLink', current.loginBottomImageLink),
    homeImage1Path:       resolveSlot('homeImage1Path',       'homeImage1',  'homeImage1Path',  current.homeImage1Path),
    homeImage1Link:       resolveLink('homeImage1Link', current.homeImage1Link),
    homeImage2Path:       resolveSlot('homeImage2Path',       'homeImage2',  'homeImage2Path',  current.homeImage2Path),
    homeImage2Link:       resolveLink('homeImage2Link', current.homeImage2Link),
    homeImage3Path:       resolveSlot('homeImage3Path',       'homeImage3',  'homeImage3Path',  current.homeImage3Path),
    homeImage3Link:       resolveLink('homeImage3Link', current.homeImage3Link),
    homeImage4Path:           resolveSlot('homeImage4Path',           'homeImage4',      'homeImage4Path',           current.homeImage4Path),
    homeImage4Link:           resolveLink('homeImage4Link', current.homeImage4Link),
    middleSidebar1ImagePath:  resolveSlot('middleSidebar1ImagePath',  'middleSidebar1',  'middleSidebar1Path',  current.middleSidebar1ImagePath),
    middleSidebar1Link:       resolveLink('middleSidebar1Link', current.middleSidebar1Link),
    middleSidebar2ImagePath:  resolveSlot('middleSidebar2ImagePath',  'middleSidebar2',  'middleSidebar2Path',  current.middleSidebar2ImagePath),
    middleSidebar2Link:       resolveLink('middleSidebar2Link', current.middleSidebar2Link),
    middleSidebar3ImagePath:  resolveSlot('middleSidebar3ImagePath',  'middleSidebar3',  'middleSidebar3Path',  current.middleSidebar3ImagePath),
    middleSidebar3Link:       resolveLink('middleSidebar3Link', current.middleSidebar3Link),
    newsImagePath:            resolveSlot('newsImagePath',            'news',            'newsPath',            current.newsImagePath),
    earnPointsImagePath:      resolveSlot('earnPointsImagePath',      'earnPoints',      'earnPointsPath',      current.earnPointsImagePath),
    labelImagePath:           resolveSlot('labelImagePath',           'label',           'labelPath',           current.labelImagePath)
  }

  const cfg = await db.homepageConfig.upsert({
    where: { id: 'homepage' },
    create: { id: 'homepage', ...next },
    update: { ...next, updatedAt: new Date() }
  })

  // Log any field changes compared to prior values
  try {
    const area = 'HomepageConfig'
    const fields = [
      'topLeftImagePath', 'bottomLeftImagePath', 'topRightImagePath', 'bottomRightImagePath',
      'bottomRightLink', 'showcaseImagePath',
      'heroImagePath', 'heroImageLink', 'heroVideoPath',
      'loginTopImagePath', 'loginTopImageLink', 'loginBottomImagePath', 'loginBottomImageLink',
      'homeImage1Path', 'homeImage1Link', 'homeImage2Path', 'homeImage2Link',
      'homeImage3Path', 'homeImage3Link', 'homeImage4Path', 'homeImage4Link',
      'middleSidebar1ImagePath', 'middleSidebar1Link',
      'middleSidebar2ImagePath', 'middleSidebar2Link',
      'middleSidebar3ImagePath', 'middleSidebar3Link',
      'newsImagePath',
      'earnPointsImagePath',
      'labelImagePath'
    ]
    for (const key of fields) {
      const prev = current[key] ?? null
      const now  = cfg[key] ?? null
      if (prev !== now) {
        await logAdminChange(db, { userId: me.id, area, key, prevValue: prev, newValue: now })
      }
    }
  } catch {}

  return {
    topLeftImagePath:        cfg.topLeftImagePath,
    bottomLeftImagePath:     cfg.bottomLeftImagePath,
    topRightImagePath:       cfg.topRightImagePath,
    bottomRightImagePath:    cfg.bottomRightImagePath,
    bottomRightLink:         cfg.bottomRightLink,
    showcaseImagePath:       cfg.showcaseImagePath,
    heroImagePath:           cfg.heroImagePath,
    heroImageLink:           cfg.heroImageLink,
    heroVideoPath:           cfg.heroVideoPath,
    loginTopImagePath:       cfg.loginTopImagePath,
    loginTopImageLink:       cfg.loginTopImageLink,
    loginBottomImagePath:    cfg.loginBottomImagePath,
    loginBottomImageLink:    cfg.loginBottomImageLink,
    homeImage1Path:          cfg.homeImage1Path,
    homeImage1Link:          cfg.homeImage1Link,
    homeImage2Path:          cfg.homeImage2Path,
    homeImage2Link:          cfg.homeImage2Link,
    homeImage3Path:          cfg.homeImage3Path,
    homeImage3Link:          cfg.homeImage3Link,
    homeImage4Path:          cfg.homeImage4Path,
    homeImage4Link:          cfg.homeImage4Link,
    middleSidebar1ImagePath: cfg.middleSidebar1ImagePath,
    middleSidebar1Link:      cfg.middleSidebar1Link,
    middleSidebar2ImagePath: cfg.middleSidebar2ImagePath,
    middleSidebar2Link:      cfg.middleSidebar2Link,
    middleSidebar3ImagePath: cfg.middleSidebar3ImagePath,
    middleSidebar3Link:      cfg.middleSidebar3Link,
    newsImagePath:           cfg.newsImagePath,
    earnPointsImagePath:     cfg.earnPointsImagePath,
    labelImagePath:          cfg.labelImagePath
  }
})

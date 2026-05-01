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
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/svg+xml','image/gif','video/mp4'])

const publicAssetPath = (filename) =>
  process.env.NODE_ENV === 'production' ? `/images/homepage/${filename}` : `/homepage/${filename}`

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
    topLeftImagePath:     null,
    bottomLeftImagePath:  null,
    topRightImagePath:    null,
    bottomRightImagePath: null,
    bottomRightLink:      null,
    showcaseImagePath:    null
  }

  // fs prep
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

  const saved = {
    topLeft:     await saveIfPresent('topLeft'),
    bottomLeft:  await saveIfPresent('bottomLeft'),
    topRight:    await saveIfPresent('topRight'),
    bottomRight: await saveIfPresent('bottomRight'),
    showcase:    await saveIfPresent('showcase'),
    homeImage1:  await saveIfPresent('homeImage1'),
    homeImage2:  await saveIfPresent('homeImage2'),
    homeImage3:  await saveIfPresent('homeImage3'),
    homeImage4:  await saveIfPresent('homeImage4')
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

  const resolveLink = (textKey, currentValue) => {
    if (has(textKey)) return norm(text[textKey]) || null
    return currentValue
  }

  const next = {
    topLeftImagePath:     resolveSlot('topLeftImagePath',     'topLeft',     'topLeftPath',     current.topLeftImagePath),
    bottomLeftImagePath:  resolveSlot('bottomLeftImagePath',  'bottomLeft',  'bottomLeftPath',  current.bottomLeftImagePath),
    topRightImagePath:    resolveSlot('topRightImagePath',    'topRight',    'topRightPath',    current.topRightImagePath),
    bottomRightImagePath: resolveSlot('bottomRightImagePath', 'bottomRight', 'bottomRightPath', current.bottomRightImagePath),
    bottomRightLink:      resolveLink('bottomRightLink', current.bottomRightLink),
    showcaseImagePath:    resolveSlot('showcaseImagePath',    'showcase',    'showcasePath',    current.showcaseImagePath),
    homeImage1Path:       resolveSlot('homeImage1Path',       'homeImage1',  'homeImage1Path',  current.homeImage1Path),
    homeImage1Link:       resolveLink('homeImage1Link', current.homeImage1Link),
    homeImage2Path:       resolveSlot('homeImage2Path',       'homeImage2',  'homeImage2Path',  current.homeImage2Path),
    homeImage2Link:       resolveLink('homeImage2Link', current.homeImage2Link),
    homeImage3Path:       resolveSlot('homeImage3Path',       'homeImage3',  'homeImage3Path',  current.homeImage3Path),
    homeImage3Link:       resolveLink('homeImage3Link', current.homeImage3Link),
    homeImage4Path:       resolveSlot('homeImage4Path',       'homeImage4',  'homeImage4Path',  current.homeImage4Path),
    homeImage4Link:       resolveLink('homeImage4Link', current.homeImage4Link)
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
      'homeImage1Path', 'homeImage1Link', 'homeImage2Path', 'homeImage2Link',
      'homeImage3Path', 'homeImage3Link', 'homeImage4Path', 'homeImage4Link'
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
    topLeftImagePath:     cfg.topLeftImagePath,
    bottomLeftImagePath:  cfg.bottomLeftImagePath,
    topRightImagePath:    cfg.topRightImagePath,
    bottomRightImagePath: cfg.bottomRightImagePath,
    bottomRightLink:      cfg.bottomRightLink,
    showcaseImagePath:    cfg.showcaseImagePath,
    homeImage1Path:       cfg.homeImage1Path,
    homeImage1Link:       cfg.homeImage1Link,
    homeImage2Path:       cfg.homeImage2Path,
    homeImage2Link:       cfg.homeImage2Link,
    homeImage3Path:       cfg.homeImage3Path,
    homeImage3Link:       cfg.homeImage3Link,
    homeImage4Path:       cfg.homeImage4Path,
    homeImage4Link:       cfg.homeImage4Link
  }
})

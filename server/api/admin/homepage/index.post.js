// server/api/admin/homepage/index.post.js
import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/svg+xml'])

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
      (part.type === 'image/svg+xml' ? '.svg' : part.type === 'image/png' ? '.png' : '.jpg')
    const filename = `${key}-${Date.now()}${ext}`
    await writeFile(join(uploadDir, filename), part.data)
    return publicAssetPath(filename)
  }

  const saved = {
    topLeft:     await saveIfPresent('topLeft'),
    bottomLeft:  await saveIfPresent('bottomLeft'),
    topRight:    await saveIfPresent('topRight'),
    bottomRight: await saveIfPresent('bottomRight'),
    showcase:    await saveIfPresent('showcase')
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

  const next = {
    topLeftImagePath:     resolveSlot('topLeftImagePath',     'topLeft',     'topLeftPath',     current.topLeftImagePath),
    bottomLeftImagePath:  resolveSlot('bottomLeftImagePath',  'bottomLeft',  'bottomLeftPath',  current.bottomLeftImagePath),
    topRightImagePath:    resolveSlot('topRightImagePath',    'topRight',    'topRightPath',    current.topRightImagePath),
    bottomRightImagePath: resolveSlot('bottomRightImagePath', 'bottomRight', 'bottomRightPath', current.bottomRightImagePath),
    showcaseImagePath:    resolveSlot('showcaseImagePath',    'showcase',    'showcasePath',    current.showcaseImagePath)
  }

  const cfg = await db.homepageConfig.upsert({
    where: { id: 'homepage' },
    create: { id: 'homepage', ...next },
    update: { ...next, updatedAt: new Date() }
  })

  return {
    topLeftImagePath:     cfg.topLeftImagePath,
    bottomLeftImagePath:  cfg.bottomLeftImagePath,
    topRightImagePath:    cfg.topRightImagePath,
    bottomRightImagePath: cfg.bottomRightImagePath,
    showcaseImagePath:    cfg.showcaseImagePath
  }
})

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
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const text = {}, files = {}
  for (const p of parts) {
    if (p.filename) files[p.name] = p
    else text[p.name] = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
  }

  let topLeftPath     = (text.topLeftPath     || '').trim()
  let bottomLeftPath  = (text.bottomLeftPath  || '').trim()
  let topRightPath    = (text.topRightPath    || '').trim()
  let bottomRightPath = (text.bottomRightPath || '').trim()
  let showcasePath    = (text.showcasePath    || '').trim()

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

  const savedTopLeft     = await saveIfPresent('topLeft')
  const savedBottomLeft  = await saveIfPresent('bottomLeft')
  const savedTopRight    = await saveIfPresent('topRight')
  const savedBottomRight = await saveIfPresent('bottomRight')
  const savedShowcase    = await saveIfPresent('showcase')

  topLeftPath     = savedTopLeft     ?? (topLeftPath     || null)
  bottomLeftPath  = savedBottomLeft  ?? (bottomLeftPath  || null)
  topRightPath    = savedTopRight    ?? (topRightPath    || null)
  bottomRightPath = savedBottomRight ?? (bottomRightPath || null)
  showcasePath    = savedShowcase    ?? (showcasePath    || null)

  if (('topLeftPath'     in text) && text.topLeftPath     === '' && !files.topLeft)     topLeftPath = null
  if (('bottomLeftPath'  in text) && text.bottomLeftPath  === '' && !files.bottomLeft)  bottomLeftPath = null
  if (('topRightPath'    in text) && text.topRightPath    === '' && !files.topRight)    topRightPath = null
  if (('bottomRightPath' in text) && text.bottomRightPath === '' && !files.bottomRight) bottomRightPath = null
  if (('showcasePath'    in text) && text.showcasePath    === '' && !files.showcase)    showcasePath = null

  const cfg = await db.homepageConfig.upsert({
    where: { id: 'homepage' },
    create: {
      id: 'homepage',
      topLeftImagePath:     topLeftPath,
      bottomLeftImagePath:  bottomLeftPath,
      topRightImagePath:    topRightPath,
      bottomRightImagePath: bottomRightPath,
      showcaseImagePath:    showcasePath
    },
    update: {
      topLeftImagePath:     topLeftPath,
      bottomLeftImagePath:  bottomLeftPath,
      topRightImagePath:    topRightPath,
      bottomRightImagePath: bottomRightPath,
      showcaseImagePath:    showcasePath,
      updatedAt: new Date()
    }
  })

  return {
    topLeftImagePath:     cfg.topLeftImagePath,
    bottomLeftImagePath:  cfg.bottomLeftImagePath,
    topRightImagePath:    cfg.topRightImagePath,
    bottomRightImagePath: cfg.bottomRightImagePath,
    showcaseImagePath:    cfg.showcaseImagePath
  }
})

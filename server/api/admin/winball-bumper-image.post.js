// server/api/admin/winball-bumper-image.post.js
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
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml'
])

const BUMPER_FIELDS = {
  '1': 'winballBumper1ImagePath',
  '2': 'winballBumper2ImagePath',
  '3': 'winballBumper3ImagePath'
}

export default defineEventHandler(async (event) => {
  // 1) Auth check
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  let bumperIndex = null
  for (const p of parts) {
    if (p.filename) filePart = p
    else if (p.name === 'bumperIndex') bumperIndex = (Buffer.isBuffer(p.data) ? p.data.toString() : p.data).trim()
  }
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (!BUMPER_FIELDS[bumperIndex]) {
    throw createError({ statusCode: 400, statusMessage: '"bumperIndex" must be 1, 2, or 3' })
  }
  if (!ALLOWED.has(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only SVG, PNG, JPG, or JPEG are allowed' })
  }

  const dbField = BUMPER_FIELDS[bumperIndex]

  // 3) Persist file
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'winball')
    : join(baseDir, 'public', 'winball')

  await mkdir(uploadDir, { recursive: true })
  const safeExt = extname(filePart.filename || '').toLowerCase() || (
    filePart.type === 'image/svg+xml' ? '.svg'
    : filePart.type === 'image/png' ? '.png'
    : '.jpg'
  )
  const filename = `winball-bumper${bumperIndex}-${Date.now()}${safeExt}`
  const outPath = join(uploadDir, filename)
  await writeFile(outPath, filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/winball/${filename}`
    : `/winball/${filename}`

  // 4) Update DB config
  try {
    const before = await db.gameConfig.findUnique({ where: { gameName: 'Winball' } })
    await db.gameConfig.upsert({
      where: { gameName: 'Winball' },
      create: { gameName: 'Winball', [dbField]: assetPath },
      update: { [dbField]: assetPath, updatedAt: new Date() }
    })
    if ((before?.[dbField] || null) !== (assetPath || null)) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GameConfig:Winball',
        key: dbField,
        prevValue: before?.[dbField] || null,
        newValue: assetPath || null
      })
    }
  } catch (err) {
    console.error(`Failed to update ${dbField} on GameConfig:`, err)
    throw createError({ statusCode: 500, statusMessage: 'Image saved, but updating config failed' })
  }

  return { assetPath, bumperIndex }
})

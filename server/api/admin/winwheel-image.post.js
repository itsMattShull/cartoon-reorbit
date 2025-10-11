// server/api/admin/winwheel-image.post.js
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

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml'
])

export default defineEventHandler(async (event) => {
  // 1) Auth check
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  let label = 'winwheel'
  for (const p of parts) {
    if (p.filename) filePart = p
    else if (p.name === 'label' && typeof p.data === 'string') label = p.data.trim() || 'winwheel'
  }
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (!ALLOWED.has(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only SVG, PNG, JPG, or JPEG are allowed' })
  }

  // 3) Persist file
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'winwheel')
    : join(baseDir, 'public', 'winwheel')

  await mkdir(uploadDir, { recursive: true })
  const safeExt = extname(filePart.filename || '').toLowerCase() || (
    filePart.type === 'image/svg+xml' ? '.svg'
    : filePart.type === 'image/png' ? '.png'
    : '.jpg'
  )
  const filename = `${label}-${Date.now()}${safeExt}`
  const outPath = join(uploadDir, filename)
  await writeFile(outPath, filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/winwheel/${filename}`
    : `/winwheel/${filename}`

  // 4) Update DB config
  try {
    await db.gameConfig.upsert({
      where: { gameName: 'Winwheel' },
      create: {
        gameName: 'Winwheel',
        winWheelImagePath: assetPath
      },
      update: {
        winWheelImagePath: assetPath,
        updatedAt: new Date()
      }
    })
  } catch (err) {
    console.error('Failed to update winWheelImagePath on GameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Image saved, but updating config failed' })
  }

  // 5) Return path for immediate UI preview
  return { assetPath }
})

import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/gif'])

const publicAssetPath = (filename) =>
  process.env.NODE_ENV === 'production' ? `/images/ad-images/${filename}` : `/ad-images/${filename}`

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  let label = null
  for (const p of parts) {
    if (p.filename) filePart = p
    else if (p.name === 'label') label = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
  }
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Image is required' })
  if (!ALLOWED.has(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid file type ${filePart.type}` })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'ad-images')
    : join(baseDir, 'public', 'ad-images')
  await mkdir(uploadDir, { recursive: true })

  const ext = extname(filePart.filename || '').toLowerCase() ||
    (filePart.type === 'image/svg+xml' ? '.svg' : filePart.type === 'image/png' ? '.png' : '.jpg')
  const filename = `ad-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

  await writeFile(join(uploadDir, filename), filePart.data)

  const row = await db.adImage.create({
    data: {
      filename,
      imagePath: publicAssetPath(filename),
      label: label?.trim() || null,
      createdById: me.id || null
    },
    select: { id: true, imagePath: true, filename: true, label: true, createdAt: true }
  })

  return row
})

import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { imageSize } from 'image-size'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']
const ALLOWED_SIZES = [ [510,344], [512,346], [800,600] ]

function sanitize(name = '') {
  return name.replace(/[^A-Za-z0-9._-]/g, '')
}

export default defineEventHandler(async (event) => {
  // Authz
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, statusMessage: 'multipart/form-data expected' })
  }

  // Parse fields
  const fields = {}
  let imagePart = null
  for (const part of parts) {
    if (part.filename) imagePart = part
    else fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
  }

  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  if (!ALLOWED_MIMES.includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, GIF, or JPEG allowed.' })
  }

  const { width, height } = imageSize(imagePart.data)
  const isAllowedSize = ALLOWED_SIZES.some(([w,h]) => w === width && h === height)
  if (!isAllowedSize) {
    const supported = ALLOWED_SIZES.map(s => s.join('×')).join(' or ')
    throw createError({ statusCode: 400, statusMessage: `Image must be exactly ${supported}.` })
  }

  const visibilityRaw = (fields.visibility || 'public').toLowerCase()
  const visibility = visibilityRaw === 'code-only' ? 'CODE_ONLY' : 'PUBLIC'
  const label = fields.label?.trim() || null

  // Decide folders & public URL
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'backgrounds')
    : join(baseDir, 'public', 'backgrounds')

  await mkdir(uploadDir, { recursive: true })
  const orig = sanitize(imagePart.filename)
  const filename = `${Date.now()}_${orig}`
  const outPath  = join(uploadDir, filename)
  await writeFile(outPath, imagePart.data)

  const imagePath = process.env.NODE_ENV === 'production'
    ? `/images/backgrounds/${filename}`
    : `/backgrounds/${filename}`

  const created = await db.background.create({
    data: {
      label,
      imagePath,
      filename,
      width,
      height,
      mimeType: imagePart.type,
      visibility,
      createdById: me.id || null
    }
  })

  return { id: created.id, imagePath: created.imagePath }
})

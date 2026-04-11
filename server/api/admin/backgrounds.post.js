import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma as db } from '@/server/prisma'
import { imageSize } from 'image-size'

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']

function bgDir() {
  return process.env.BASE_UPLOAD_DIRECTORY
    ? join(process.env.BASE_UPLOAD_DIRECTORY, 'backgrounds')
    : join(process.cwd(), 'public', 'backgrounds')
}

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

  const visibilityRaw = (fields.visibility || 'public').toLowerCase()
  const visibility = visibilityRaw === 'code-only' ? 'CODE_ONLY' : 'PUBLIC'
  const label = fields.label?.trim() || null

  const uploadDir = bgDir()
  await mkdir(uploadDir, { recursive: true })
  const orig = sanitize(imagePart.filename)
  const filename = `${Date.now()}_${orig}`
  const outPath  = join(uploadDir, filename)
  await writeFile(outPath, imagePart.data)

  const imagePath = `/api/czone-bg/${filename}`

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

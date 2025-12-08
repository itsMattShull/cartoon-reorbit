// server/api/admin/scavenger/step-image.post.js
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

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/svg+xml'
])

export default defineEventHandler(async (event) => {
  // 1) Admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  let label = 'scavenger'
  let storyId = null
  let pathKey = ''
  for (const p of parts) {
    if (p.filename) filePart = p
    else if (p.name === 'label' && typeof p.data === 'string') label = p.data.trim() || 'scavenger'
    else if (p.name === 'storyId' && typeof p.data === 'string') storyId = p.data.trim() || null
    else if (p.name === 'path' && typeof p.data === 'string') pathKey = p.data.trim() || ''
  }
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (!ALLOWED.has(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only SVG, PNG, JPG, JPEG, or GIF are allowed' })
  }

  // 3) Persist file
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'scavenger')
    : join(baseDir, 'public', 'scavenger')

  await mkdir(uploadDir, { recursive: true })

  const ext = (extname(filePart.filename || '') || '').toLowerCase() || (
    filePart.type === 'image/svg+xml' ? '.svg'
    : filePart.type === 'image/png' ? '.png'
    : filePart.type === 'image/gif' ? '.gif'
    : '.jpg'
  )
  const base = basename(filePart.filename || 'image', ext) || 'image'
  const tag = [label, pathKey].filter(Boolean).join('-')
  const filename = `${tag || 'scavenger'}-${Date.now()}${ext}`

  const outPath = join(uploadDir, filename)
  await writeFile(outPath, filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/scavenger/${filename}`
    : `/scavenger/${filename}`

  // 4) Optionally update an existing step image if storyId+path provided
  if (storyId && (pathKey || pathKey === '')) {
    const layer = (pathKey.length || 0) + 1
    try {
      await db.scavengerStep.updateMany({
        where: { storyId, layer, path: pathKey },
        data: { imagePath: assetPath }
      })
    } catch (err) {
      // ignore DB failures; still return the asset path so UI can save later
    }
  }

  return { assetPath }
})


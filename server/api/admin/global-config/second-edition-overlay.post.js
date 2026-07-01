// server/api/admin/global-config/second-edition-overlay.post.js
// Uploads the single global "Second Edition" overlay icon shown over every
// Second Edition cToon's image sitewide.
import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

const ALLOWED_TYPES = new Set(['image/png', 'image/gif'])
const MAX_BYTES = 3 * 1024 * 1024 // 3MB

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  const imagePart = (parts || []).find(p => p.filename && p.name === 'image')
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!ALLOWED_TYPES.has(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG or GIF only.' })
  }
  if (!imagePart.data || imagePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 3MB or smaller.' })
  }

  // 3) Natural dimensions (used as the default "100%" size on cToon overlays)
  let width = null
  let height = null
  try {
    const meta = await sharp(imagePart.data).metadata()
    width = meta.width ?? null
    height = meta.height ?? null
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not read image dimensions.' })
  }

  // 4) Save with a server-generated filename — never trust the client filename/path
  const ext = imagePart.type === 'image/gif' ? '.gif' : '.png'
  const filename = `second-edition-overlay-${Date.now()}${ext}`
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'global')
    : join(baseDir, 'public', 'global')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imagePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/global/${filename}`
    : `/global/${filename}`

  // 5) Persist to the singleton global config row
  const before = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const updated = await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      secondEditionOverlayPath: assetPath,
      secondEditionOverlayWidth: width,
      secondEditionOverlayHeight: height
    },
    update: {
      secondEditionOverlayPath: assetPath,
      secondEditionOverlayWidth: width,
      secondEditionOverlayHeight: height
    }
  })

  try {
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'secondEditionOverlayPath',
      prevValue: before?.secondEditionOverlayPath ?? null,
      newValue: updated.secondEditionOverlayPath
    })
  } catch {}

  return {
    secondEditionOverlayPath: updated.secondEditionOverlayPath,
    secondEditionOverlayWidth: updated.secondEditionOverlayWidth,
    secondEditionOverlayHeight: updated.secondEditionOverlayHeight
  }
})

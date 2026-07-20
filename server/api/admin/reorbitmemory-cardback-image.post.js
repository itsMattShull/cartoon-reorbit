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

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif'])

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (!ALLOWED.has(filePart.type)) throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPG, SVG, or GIF allowed' })

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'game-tiles')
    : join(baseDir, 'public', 'game-tiles')
  await mkdir(uploadDir, { recursive: true })

  const safeExt = extname(filePart.filename || '').toLowerCase() || (
    filePart.type === 'image/svg+xml' ? '.svg'
    : filePart.type === 'image/png' ? '.png'
    : filePart.type === 'image/gif' ? '.gif'
    : '.jpg'
  )
  const filename = `reorbitmemory-cardback-${Date.now()}${safeExt}`
  await writeFile(join(uploadDir, filename), filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/game-tiles/${filename}`
    : `/game-tiles/${filename}`

  const before = await db.gameConfig.findUnique({ where: { gameName: 'ReOrbitMemory' } })
  await db.gameConfig.upsert({
    where: { gameName: 'ReOrbitMemory' },
    create: { gameName: 'ReOrbitMemory', reorbitMemoryCardBackImagePath: assetPath },
    update: { reorbitMemoryCardBackImagePath: assetPath, updatedAt: new Date() }
  })

  if ((before?.reorbitMemoryCardBackImagePath ?? null) !== assetPath) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GameConfig:ReOrbitMemory',
      key: 'reorbitMemoryCardBackImagePath',
      prevValue: before?.reorbitMemoryCardBackImagePath ?? null,
      newValue: assetPath
    }).catch(() => {})
  }

  return { assetPath }
})

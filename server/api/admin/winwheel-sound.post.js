// server/api/admin/winwheel-sound.post.js
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
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg'
])

function resolveExt(filePart) {
  const ext = extname(filePart.filename || '').toLowerCase()
  if (ext) return ext
  if (filePart.type === 'audio/ogg') return '.ogg'
  if (filePart.type === 'audio/wav' || filePart.type === 'audio/x-wav') return '.wav'
  return '.mp3'
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
  let label = 'winwheel-sound'
  for (const p of parts) {
    if (p.filename) filePart = p
    else if (p.name === 'label' && typeof p.data === 'string') label = p.data.trim() || 'winwheel-sound'
  }
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing audio file' })
  if (!ALLOWED.has(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only MP3, WAV, or OGG are allowed' })
  }

  // 3) Persist file
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'winwheel')
    : join(baseDir, 'public', 'winwheel')

  await mkdir(uploadDir, { recursive: true })
  const safeExt = resolveExt(filePart)
  const filename = `${label}-${Date.now()}${safeExt}`
  const outPath = join(uploadDir, filename)
  await writeFile(outPath, filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/winwheel/${filename}`
    : `/winwheel/${filename}`

  // 4) Update DB config
  try {
    const before = await db.gameConfig.findUnique({ where: { gameName: 'Winwheel' } })
    await db.gameConfig.upsert({
      where: { gameName: 'Winwheel' },
      create: {
        gameName: 'Winwheel',
        winWheelSoundPath: assetPath
      },
      update: {
        winWheelSoundPath: assetPath,
        updatedAt: new Date()
      }
    })
    if ((before?.winWheelSoundPath || null) !== (assetPath || null)) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GameConfig:Winwheel',
        key: 'winWheelSoundPath',
        prevValue: before?.winWheelSoundPath || null,
        newValue: assetPath || null
      })
    }
  } catch (err) {
    console.error('Failed to update winWheelSoundPath on GameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Audio saved, but updating config failed' })
  }

  // 5) Return path for immediate UI preview
  return { assetPath }
})

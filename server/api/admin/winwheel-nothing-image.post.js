// server/api/admin/winwheel-nothing-image.post.js
//
// Uploads the GIF/image shown in the "You got nothing" result modal on the Win Wheel.
// Mirrors server/api/admin/winwheel-image.post.js (the main wheel-face image upload) but
// writes to a separate GameConfig column (winWheelNothingGifPath) and allows image/gif,
// since a GIF is the whole point of this particular slot.
import {
  defineEventHandler,
  readMultipartFormData,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED = new Set([
  'image/gif',
  'image/png',
  'image/jpeg',
  'image/jpg'
])

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  for (const p of parts) {
    if (p.filename) filePart = p
  }
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (!ALLOWED.has(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only GIF, PNG, or JPEG are allowed' })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'winwheel')
    : join(baseDir, 'public', 'winwheel')

  await mkdir(uploadDir, { recursive: true })
  const safeExt = extname(filePart.filename || '').toLowerCase() || (
    filePart.type === 'image/gif' ? '.gif'
    : filePart.type === 'image/png' ? '.png'
    : '.jpg'
  )
  const filename = `nothing-${Date.now()}${safeExt}`
  const outPath = join(uploadDir, filename)
  await writeFile(outPath, filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/winwheel/${filename}`
    : `/winwheel/${filename}`

  try {
    const before = await db.gameConfig.findUnique({ where: { gameName: 'Winwheel' } })
    await db.gameConfig.upsert({
      where: { gameName: 'Winwheel' },
      create: {
        gameName: 'Winwheel',
        winWheelNothingGifPath: assetPath
      },
      update: {
        winWheelNothingGifPath: assetPath,
        updatedAt: new Date()
      }
    })
    if ((before?.winWheelNothingGifPath || null) !== (assetPath || null)) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GameConfig:Winwheel',
        key: 'winWheelNothingGifPath',
        prevValue: before?.winWheelNothingGifPath || null,
        newValue: assetPath || null
      })
    }
  } catch (err) {
    console.error('Failed to update winWheelNothingGifPath on GameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Image saved, but updating config failed' })
  }

  return { assetPath }
})

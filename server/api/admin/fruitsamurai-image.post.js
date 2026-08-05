import {
  defineEventHandler,
  readMultipartFormData,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { MAX_IMAGE_BYTES, sniffImageType } from '@/server/utils/imageUploadValidation'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// Allowlist mapping the slot to its column. Never build the column name by interpolating the
// slot, and never let the slot reach the filename.
const SLOT_COLUMNS = {
  jack: 'fruitSamuraiJackImagePath',
  background: 'fruitSamuraiBackgroundImagePath'
}

// Jack stands roughly half the height of a 760-unit world on a canvas that never exceeds ~2x
// that in device pixels; the background is a full-world backdrop. Anything larger is wasted
// bytes on every load of the game.
const SLOT_MAX_WIDTH = { jack: 480, background: 1024 }

export default defineEventHandler(async (event) => {
  // event.context.userId is set by the auth middleware; reading the flags straight from the DB
  // avoids an internal HTTP round-trip and, unlike an isAdmin-only check, refuses a suspended
  // or deactivated admin.
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, banned: true, active: true }
  })
  if (!me?.isAdmin || me.banned || me.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const slotPart = parts.find(p => !p.filename && p.name === 'slot')
  const slot = slotPart ? String(slotPart.data).trim() : ''
  if (!Object.hasOwn(SLOT_COLUMNS, slot)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slot' })
  }
  const column = SLOT_COLUMNS[slot]

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  // The multipart "type" field and the filename are both client-supplied. Trusting the
  // filename's extension is what would let an .html or .svg land in a directory served from
  // this origin, so the extension is derived from the actual bytes and the whole name is built
  // server-side. SVG is intentionally unsupported: sniffImageType doesn't recognize it, and it
  // would execute script on direct navigation.
  const sniffed = sniffImageType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF or WebP images are allowed' })
  }

  // Re-encode rather than storing the upload as-is: without this an admin can drop a 5MB PNG
  // into the load path of every single game.
  let output
  try {
    output = await sharp(filePart.data)
      .resize({ width: SLOT_MAX_WIDTH[slot], withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'game-tiles')
    : join(baseDir, 'public', 'game-tiles')
  await mkdir(uploadDir, { recursive: true })

  const filename = `fruitsamurai-${slot}-${Date.now()}.webp`
  await writeFile(join(uploadDir, filename), output)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/game-tiles/${filename}`
    : `/game-tiles/${filename}`

  const before = await db.gameConfig.findUnique({ where: { gameName: 'FruitSamurai' } })
  await db.gameConfig.upsert({
    where: { gameName: 'FruitSamurai' },
    create: { gameName: 'FruitSamurai', [column]: assetPath },
    update: { [column]: assetPath, updatedAt: new Date() }
  })

  if ((before?.[column] ?? null) !== assetPath) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GameConfig:FruitSamurai',
      key: column,
      prevValue: before?.[column] ?? null,
      newValue: assetPath
    }).catch(() => {})
  }

  return { assetPath, slot }
})

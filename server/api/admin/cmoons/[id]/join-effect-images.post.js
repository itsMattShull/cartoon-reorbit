// server/api/admin/cmoons/[id]/join-effect-images.post.js
// Uploads one image into a cMoon's full-screen join effect. Mirrors the
// validated-upload pattern in server/api/admin/flappy-image.post.js: content is
// sniffed from magic bytes (never trusted from the client's declared MIME type
// or filename), then re-encoded with sharp so an oversized/hostile source image
// never reaches disk or the animated overlay as-is.
import {
  defineEventHandler,
  readMultipartFormData,
  getRouterParam,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { MAX_IMAGE_BYTES, sniffImageType } from '@/server/utils/imageUploadValidation'
import { JOIN_EFFECT_MAX_IMAGES } from '@/server/utils/cmoon'
import { cmoonJoinEffectUploadDir, cmoonJoinEffectPublicPath } from '@/server/utils/cmoonJoinEffectStorage'

// Effect images stack/rise across the full viewport but are shown small
// (icon/sticker sized); nothing here is ever displayed larger than a few
// hundred CSS pixels, even on a big desktop screen.
const MAX_WIDTH = 640

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, banned: true, active: true }
  })
  if (!me?.isAdmin || me.banned || me.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const cMoonId = getRouterParam(event, 'id')
  const cmoon = await db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const existingCount = await db.cMoonJoinEffectImage.count({ where: { cMoonId } })
  if (existingCount >= JOIN_EFFECT_MAX_IMAGES) {
    throw createError({ statusCode: 400, statusMessage: `A cMoon can have at most ${JOIN_EFFECT_MAX_IMAGES} join-effect images` })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image file' })
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const sniffed = sniffImageType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF or WebP images are allowed' })
  }

  let output
  try {
    output = await sharp(filePart.data)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
  }

  const uploadDir = cmoonJoinEffectUploadDir()
  await mkdir(uploadDir, { recursive: true })

  const filename = `cmoon-${cMoonId}-${Date.now()}-${randomUUID()}.webp`
  await writeFile(join(uploadDir, filename), output)

  const imagePath = cmoonJoinEffectPublicPath(filename)

  const row = await db.cMoonJoinEffectImage.create({
    data: { cMoonId, filename, imagePath, order: existingCount },
    select: { id: true, imagePath: true },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoon:joinEffectImages',
    key: `add:${cMoonId}`,
    prevValue: null,
    newValue: { id: row.id, imagePath: row.imagePath },
  }).catch(() => {})

  return row
})

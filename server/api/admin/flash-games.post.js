// server/api/admin/flash-games.post.js — creates one uploaded Flash game (see FlashGame's own
// schema comment). The .swf is required; the thumbnail image is optional (a blank one just shows
// a plain text tile on the public listing, same convention GamesHome.vue's own tiles follow).
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside, sanitizeFilename, sniffImageType, MAX_IMAGE_BYTES, sniffSwfType, MAX_SWF_BYTES } from '@/server/utils/imageUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'flash-games'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const parts = await readMultipartFormData(event)
  const fields = {}
  let thumbPart = null
  let swfPart = null
  for (const part of parts || []) {
    if (part.filename && part.name === 'thumbnail') thumbPart = part
    else if (part.filename && part.name === 'swf') swfPart = part
    else fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
  }

  const title = (fields.title || '').trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  if (!swfPart) throw createError({ statusCode: 400, statusMessage: 'A .swf file is required.' })
  if (swfPart.data.length > MAX_SWF_BYTES) {
    throw createError({ statusCode: 400, statusMessage: `SWF too large (max ${MAX_SWF_BYTES / 1024 / 1024}MB).` })
  }
  if (!sniffSwfType(swfPart.data)) {
    throw createError({ statusCode: 400, statusMessage: 'That file is not a valid SWF.' })
  }

  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })

  const swfFilename = `flash-game-swf-${Date.now()}-${sanitizeFilename(swfPart.filename)}`
  await writeFile(assertInside(dir, uploadFsPath(FEATURE, swfFilename)), swfPart.data)
  const swfPath = uploadPublicPath(FEATURE, swfFilename)

  let thumbnailPath = null
  if (thumbPart) {
    if (thumbPart.data.length > MAX_IMAGE_BYTES) {
      throw createError({ statusCode: 400, statusMessage: `Thumbnail too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).` })
    }
    if (!sniffImageType(thumbPart.data)) {
      throw createError({ statusCode: 400, statusMessage: 'Thumbnail must be a PNG, JPEG, GIF, or WEBP image.' })
    }
    const thumbFilename = `flash-game-thumb-${Date.now()}-${sanitizeFilename(thumbPart.filename)}`
    await writeFile(assertInside(dir, uploadFsPath(FEATURE, thumbFilename)), thumbPart.data)
    thumbnailPath = uploadPublicPath(FEATURE, thumbFilename)
  }

  const sortOrderInt = Number.isFinite(Number(fields.sortOrder)) ? Math.trunc(Number(fields.sortOrder)) : 0
  const active = fields.active == null || String(fields.active) === 'true'

  const created = await db.flashGame.create({
    data: {
      title,
      description: (fields.description || '').trim() || null,
      thumbnailPath,
      swfPath,
      active,
      sortOrder: sortOrderInt,
    },
  })

  await logAdminChange(db, { userId: me.id, area: 'FlashGame', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, title: created.title } })

  return { game: created }
})

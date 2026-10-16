// server/api/admin/flash-games/[id].put.js — edits title/description/active/sortOrder, and
// optionally replaces the thumbnail and/or the swf. Mirrors server/api/admin/ctoon/[id].put.js's
// own optional-file-replace shape (clearThumbnail flag, same as that file's clearSound/clearSwf).
import { defineEventHandler, readMultipartFormData, readBody, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside, sanitizeFilename, sniffImageType, MAX_IMAGE_BYTES, sniffSwfType, MAX_SWF_BYTES } from '@/server/utils/imageUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'flash-games'

function unlinkIfLocal(path) {
  if (!path) return
  const filename = path.split('/').pop()
  if (filename) { try { unlink(uploadFsPath(FEATURE, filename)) } catch {} }
}

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const existing = await db.flashGame.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Flash game not found' })

  const contentType = (getRequestHeader(event, 'content-type') || '').toLowerCase()
  let fields = {}
  let thumbPart = null
  let swfPart = null
  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    for (const part of parts || []) {
      if (part.filename && part.name === 'thumbnail') thumbPart = part
      else if (part.filename && part.name === 'swf') swfPart = part
      else fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
    }
  } else {
    fields = await readBody(event) || {}
  }

  const dir = uploadDir(FEATURE)
  const data = {}

  if (fields.title != null) {
    const title = String(fields.title).trim()
    if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
    data.title = title
  }
  if (fields.description != null) data.description = String(fields.description).trim() || null
  if (fields.active != null) data.active = String(fields.active) === 'true'
  if (fields.sortOrder != null && Number.isFinite(Number(fields.sortOrder))) {
    data.sortOrder = Math.trunc(Number(fields.sortOrder))
  }

  if (swfPart) {
    if (swfPart.data.length > MAX_SWF_BYTES) {
      throw createError({ statusCode: 400, statusMessage: `SWF too large (max ${MAX_SWF_BYTES / 1024 / 1024}MB).` })
    }
    if (!sniffSwfType(swfPart.data)) {
      throw createError({ statusCode: 400, statusMessage: 'That file is not a valid SWF.' })
    }
    await mkdir(dir, { recursive: true })
    const swfFilename = `flash-game-swf-${Date.now()}-${sanitizeFilename(swfPart.filename)}`
    await writeFile(assertInside(dir, uploadFsPath(FEATURE, swfFilename)), swfPart.data)
    data.swfPath = uploadPublicPath(FEATURE, swfFilename)
  }

  if (thumbPart) {
    if (thumbPart.data.length > MAX_IMAGE_BYTES) {
      throw createError({ statusCode: 400, statusMessage: `Thumbnail too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).` })
    }
    if (!sniffImageType(thumbPart.data)) {
      throw createError({ statusCode: 400, statusMessage: 'Thumbnail must be a PNG, JPEG, GIF, or WEBP image.' })
    }
    await mkdir(dir, { recursive: true })
    const thumbFilename = `flash-game-thumb-${Date.now()}-${sanitizeFilename(thumbPart.filename)}`
    await writeFile(assertInside(dir, uploadFsPath(FEATURE, thumbFilename)), thumbPart.data)
    data.thumbnailPath = uploadPublicPath(FEATURE, thumbFilename)
  } else if (String(fields.clearThumbnail) === 'true') {
    data.thumbnailPath = null
  }

  const updated = await db.flashGame.update({ where: { id }, data })

  // Unlink the replaced/removed files only after the DB write succeeds, same ordering the taunt
  // sound upload endpoint already follows — never delete a file the DB might still be pointing at.
  if (swfPart && existing.swfPath) unlinkIfLocal(existing.swfPath)
  if ((thumbPart || data.thumbnailPath === null) && existing.thumbnailPath) unlinkIfLocal(existing.thumbnailPath)

  await logAdminChange(db, { userId: me.id, area: `FlashGame:${id}`, key: 'update', prevValue: null, newValue: data })

  return { game: updated }
})

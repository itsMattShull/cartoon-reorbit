// server/api/admin/myorbit-tiles/[id].put.js
// Updates a tile's metadata, and optionally replaces its art — the same single multipart
// request handles both, since a bare metadata edit (e.g. flipping `walkable`) shouldn't require
// re-uploading an unchanged image.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'
import { parseMyOrbitTileBody } from '@/server/utils/myOrbitAssets'
import { processMyOrbitArtUpload, splitMultipartParts, MAX_MYORBIT_UPLOAD_BYTES } from '@/server/utils/myOrbitImageUpload'

const FEATURE = 'myorbit-tiles'
const STATIC_OUTPUT = 400
const GIF_OUTPUT = 300

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const existing = await db.myOrbitTile.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Tile not found' })

  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_MYORBIT_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const { fields, filePart } = splitMultipartParts(parts)

  const parsed = parseMyOrbitTileBody(fields, existing)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const data = { ...parsed.data }

  let newFilename = null
  if (filePart) {
    const { output, ext } = await processMyOrbitArtUpload(filePart.data, { staticOutput: STATIC_OUTPUT, gifOutput: GIF_OUTPUT })
    const dir = uploadDir(FEATURE)
    await mkdir(dir, { recursive: true })
    newFilename = `myorbit-tile-${id}-${Date.now()}.${ext}`
    await writeFile(uploadFsPath(FEATURE, newFilename), output)
    data.assetPath = uploadPublicPath(FEATURE, newFilename)
  }

  let updated
  try {
    updated = await db.myOrbitTile.update({ where: { id }, data })
  } catch (err) {
    // The NEW file (if any) is already on disk - clean it up on a failed update so a rejected
    // save never leaves an orphaned replacement image behind. The row still points at the OLD
    // file either way, since the update never committed, so that one is left untouched.
    if (newFilename) { try { await unlink(uploadFsPath(FEATURE, newFilename)) } catch {} }
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A tile with that name already exists' })
    }
    throw err
  }

  // Only unlink the old file once the new row (and thus the new file) has actually committed —
  // never delete-then-write, which would leave a broken image for every room using this tile if
  // the write step failed partway through.
  if (filePart && existing.assetPath && existing.assetPath !== updated.assetPath) {
    const oldFilename = existing.assetPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitTile', key: `update:${id}`,
    prevValue: { name: existing.name, walkable: existing.walkable, assetPath: existing.assetPath },
    newValue: { name: updated.name, walkable: updated.walkable, assetPath: updated.assetPath }
  })

  return { id: updated.id, assetPath: updated.assetPath }
})

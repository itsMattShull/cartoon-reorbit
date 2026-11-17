// server/api/admin/myorbit-furniture/[id].put.js
// Same metadata-plus-optional-art-replace shape as myorbit-tiles/[id].put.js.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'
import { parseMyOrbitFurnitureBody } from '@/server/utils/myOrbitAssets'
import { processMyOrbitArtUpload, splitMultipartParts, MAX_MYORBIT_UPLOAD_BYTES } from '@/server/utils/myOrbitImageUpload'

const FEATURE = 'myorbit-furniture'
const STATIC_OUTPUT = 400
const GIF_OUTPUT = 300

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const existing = await db.myOrbitFurniture.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Furniture not found' })

  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_MYORBIT_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const { fields, filePart } = splitMultipartParts(parts)

  const parsed = parseMyOrbitFurnitureBody(fields, existing)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const data = { ...parsed.data }

  let newFilename = null
  if (filePart) {
    const { output, ext } = await processMyOrbitArtUpload(filePart.data, { staticOutput: STATIC_OUTPUT, gifOutput: GIF_OUTPUT })
    const dir = uploadDir(FEATURE)
    await mkdir(dir, { recursive: true })
    newFilename = `myorbit-furniture-${id}-${Date.now()}.${ext}`
    await writeFile(uploadFsPath(FEATURE, newFilename), output)
    data.assetPath = uploadPublicPath(FEATURE, newFilename)
  }

  let updated
  try {
    updated = await db.myOrbitFurniture.update({ where: { id }, data })
  } catch (err) {
    // The NEW file (if any) is already on disk - clean it up on a failed update so a rejected
    // save never leaves an orphaned replacement image behind. The row still points at the OLD
    // file either way, since the update never committed, so that one is left untouched.
    if (newFilename) { try { await unlink(uploadFsPath(FEATURE, newFilename)) } catch {} }
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Furniture with that name already exists' })
    }
    throw err
  }

  if (filePart && existing.assetPath && existing.assetPath !== updated.assetPath) {
    const oldFilename = existing.assetPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitFurniture', key: `update:${id}`,
    prevValue: {
      name: existing.name, footprintW: existing.footprintW, footprintH: existing.footprintH,
      blocksWalk: existing.blocksWalk, zOffset: existing.zOffset, assetPath: existing.assetPath
    },
    newValue: {
      name: updated.name, footprintW: updated.footprintW, footprintH: updated.footprintH,
      blocksWalk: updated.blocksWalk, zOffset: updated.zOffset, assetPath: updated.assetPath
    }
  })

  return { id: updated.id, assetPath: updated.assetPath }
})

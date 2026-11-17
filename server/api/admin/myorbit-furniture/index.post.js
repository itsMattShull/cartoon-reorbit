// server/api/admin/myorbit-furniture/index.post.js
// Same single-multipart-request create shape as myorbit-tiles/index.post.js — see that file's
// own header comment for why metadata + art land in one request.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { randomUUID } from 'node:crypto'
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

  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_MYORBIT_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const { fields, filePart } = splitMultipartParts(parts)

  const parsed = parseMyOrbitFurnitureBody(fields)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  const { output, ext } = await processMyOrbitArtUpload(filePart.data, { staticOutput: STATIC_OUTPUT, gifOutput: GIF_OUTPUT })

  const id = randomUUID()
  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })
  const filename = `myorbit-furniture-${id}-${Date.now()}.${ext}`
  await writeFile(uploadFsPath(FEATURE, filename), output)
  const assetPath = uploadPublicPath(FEATURE, filename)

  let created
  try {
    created = await db.myOrbitFurniture.create({ data: { id, ...parsed.data, assetPath } })
  } catch (err) {
    // The file is already on disk at this point - clean it up on any failed insert (a duplicate
    // name, or anything else) so a rejected create never leaves an orphaned image behind.
    try { await unlink(uploadFsPath(FEATURE, filename)) } catch {}
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Furniture with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitFurniture', key: `create:${created.id}`,
    prevValue: null, newValue: { id: created.id, name: created.name }
  })

  return { id: created.id, assetPath: created.assetPath }
})

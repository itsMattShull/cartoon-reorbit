import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { imageSize } from 'image-size'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { redis } from '@/server/utils/redis'
import { clearSearchesCache } from '@/server/api/czone/[username]/searches.get'

const __dirname = dirname(fileURLToPath(import.meta.url))
// In production this file is at server/api/admin/backgrounds/[id]/ — 5 levels up to project root.
// In dev, process.cwd() is always the project root.
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..', '..')
  : process.cwd()

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']
const ALLOWED_SIZES = [[510, 344], [512, 346], [800, 600]]

function sanitize(name = '') {
  return name.replace(/[^A-Za-z0-9._-]/g, '') || 'image'
}

function fsPathFromFilename(filename) {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'backgrounds', filename)
    : join(baseDir, 'public', 'backgrounds', filename)
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const id = event.context.params?.id
  const bg = await db.background.findUnique({ where: { id } })
  if (!bg) throw createError({ statusCode: 404, statusMessage: 'Background not found' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'multipart/form-data expected' })

  let imagePart = null
  for (const part of parts) {
    if (part.filename) { imagePart = part; break }
  }
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  if (!ALLOWED_MIMES.includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, GIF, or JPEG allowed.' })
  }

  const { width, height } = imageSize(imagePart.data)
  const isAllowedSize = ALLOWED_SIZES.some(([w, h]) => w === width && h === height)
  if (!isAllowedSize) {
    const supported = ALLOWED_SIZES.map(s => s.join('×')).join(', ')
    throw createError({ statusCode: 400, statusMessage: `Image must be exactly ${supported}.` })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'backgrounds')
    : join(baseDir, 'public', 'backgrounds')

  await mkdir(uploadDir, { recursive: true })

  const orig = sanitize(imagePart.filename)
  const newFilename = `${Date.now()}_${orig}`
  const outPath = join(uploadDir, newFilename)
  await writeFile(outPath, imagePart.data)

  const newImagePath = process.env.NODE_ENV === 'production'
    ? `/images/backgrounds/${newFilename}`
    : `/backgrounds/${newFilename}`

  const oldFilename = bg.filename
  const oldImagePath = bg.imagePath

  // Collect affected search IDs before the transaction so we can invalidate cache after
  const affectedPrizes = await db.cZoneSearchPrize.findMany({
    where: { conditionBackgrounds: { has: oldFilename } },
    select: { cZoneSearchId: true }
  })
  const affectedSearchIds = [...new Set(affectedPrizes.map(p => p.cZoneSearchId))]

  try {
    await db.$transaction(async (tx) => {
      // Update the Background record
      await tx.background.update({
        where: { id },
        data: { imagePath: newImagePath, filename: newFilename, width, height, mimeType: imagePart.type }
      })

      // Update CZone.background (top-level column)
      await tx.$executeRaw`
        UPDATE "CZone"
        SET "background" = ${newImagePath}
        WHERE "background" = ${oldImagePath}
      `

      // Update background references inside CZone.layoutData.zones JSON
      await tx.$executeRaw`
        UPDATE "CZone"
        SET "layoutData" = jsonb_set(
          "layoutData",
          '{zones}',
          COALESCE(
            (SELECT jsonb_agg(
              CASE WHEN zone->>'background' = ${oldImagePath}
                THEN jsonb_set(zone, '{background}', to_jsonb(${newImagePath}::text))
                ELSE zone
              END
            ) FROM jsonb_array_elements("layoutData"->'zones') AS zone),
            '[]'::jsonb
          )
        )
        WHERE jsonb_typeof("layoutData"->'zones') = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("layoutData"->'zones') AS z
            WHERE z->>'background' = ${oldImagePath}
          )
      `

      // Replace old filename with new in CZoneSearchPrize.conditionBackgrounds
      await tx.$executeRaw`
        UPDATE "CZoneSearchPrize"
        SET "conditionBackgrounds" = array_replace("conditionBackgrounds", ${oldFilename}, ${newFilename})
        WHERE ${oldFilename} = ANY("conditionBackgrounds")
      `
    })
  } catch (err) {
    // Transaction failed — delete the newly written file so it doesn't orphan on disk
    try { await unlink(outPath) } catch {}
    throw createError({ statusCode: 500, statusMessage: 'Failed to replace image' })
  }

  // DB committed — now safe to remove the old file
  try { await unlink(fsPathFromFilename(oldFilename)) } catch {}

  // Invalidate Redis cache for any affected cZone searches
  for (const searchId of affectedSearchIds) {
    try { await redis.del(`czone:search-meta:${searchId}`) } catch {}
  }
  if (affectedSearchIds.length > 0) clearSearchesCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'Background',
    key: 'image',
    prevValue: oldImagePath,
    newValue: newImagePath
  })

  return {
    id,
    imagePath: newImagePath,
    filename: newFilename,
    width,
    height,
    mimeType: imagePart.type,
    dimensionChanged: width !== bg.width || height !== bg.height
  }
})

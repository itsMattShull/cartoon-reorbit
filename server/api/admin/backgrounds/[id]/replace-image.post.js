import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma as db } from '@/server/prisma'
import { imageSize } from 'image-size'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { redis } from '@/server/utils/redis'
import { clearSearchesCache } from '@/server/api/czone/[username]/searches.get'
import { backgroundUploadDir, backgroundFsPath, backgroundPublicPath } from '@/server/utils/backgroundStorage'

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']
const ALLOWED_SIZES = [[510, 344], [512, 346], [800, 600]]

function sanitize(name = '') {
  return name.replace(/[^A-Za-z0-9._-]/g, '') || 'image'
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

  const uploadDir = backgroundUploadDir()

  await mkdir(uploadDir, { recursive: true })

  const orig = sanitize(imagePart.filename)
  const newFilename = `${Date.now()}_${orig}`
  const outPath = join(uploadDir, newFilename)
  await writeFile(outPath, imagePart.data)

  const newImagePath = backgroundPublicPath(newFilename)

  const oldFilename = bg.filename
  const oldImagePath = bg.imagePath

  // Collect affected search IDs before the transaction so we can invalidate cache after
  const affectedPrizes = await db.cZoneSearchPrize.findMany({
    where: { conditionBackgrounds: { has: oldFilename } },
    select: { cZoneSearchId: true }
  })
  const affectedSearchIds = [...new Set(affectedPrizes.map(p => p.cZoneSearchId))]

  // Find affected CZone rows BEFORE opening the transaction. The CZone table
  // has no index on `background`/`layoutData`, so this predicate requires a
  // full-table scan with per-row JSONB unnesting — fine to run as a plain
  // query (no deadline), but ruinous inside a Prisma interactive transaction,
  // whose default 5s timeout it can blow past as the table grows, silently
  // rolling back the whole edit (including the Background row itself).
  const affectedCzones = await db.$queryRaw`
    SELECT id FROM "CZone"
    WHERE "background" = ${oldImagePath}
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements("layoutData"->'zones') AS z
         WHERE z->>'background' = ${oldImagePath}
       )
  `
  const affectedCzoneIds = affectedCzones.map((r) => r.id)

  try {
    await db.$transaction(async (tx) => {
      // Update the Background record
      await tx.background.update({
        where: { id },
        data: { imagePath: newImagePath, filename: newFilename, width, height, mimeType: imagePart.type }
      })

      // Targeted by primary key (from the pre-computed list above) so this
      // stays fast — and within the transaction timeout — no matter how
      // large the CZone table is.
      if (affectedCzoneIds.length > 0) {
        // Update CZone.background (top-level column)
        await tx.$executeRaw`
          UPDATE "CZone"
          SET "background" = ${newImagePath}
          WHERE id = ANY(${affectedCzoneIds}) AND "background" = ${oldImagePath}
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
          WHERE id = ANY(${affectedCzoneIds})
            AND jsonb_typeof("layoutData"->'zones') = 'array'
        `
      }

      // Replace old filename with new in CZoneSearchPrize.conditionBackgrounds
      await tx.$executeRaw`
        UPDATE "CZoneSearchPrize"
        SET "conditionBackgrounds" = array_replace("conditionBackgrounds", ${oldFilename}, ${newFilename})
        WHERE ${oldFilename} = ANY("conditionBackgrounds")
      `
    }, { timeout: 20000, maxWait: 5000 })
  } catch (err) {
    console.error('[backgrounds/replace-image] transaction failed:', err)
    // Transaction failed — delete the newly written file so it doesn't orphan on disk
    try { await unlink(outPath) } catch {}
    throw createError({ statusCode: 500, statusMessage: 'Failed to replace image' })
  }

  // DB committed — now safe to remove the old file
  try { await unlink(backgroundFsPath(oldFilename)) } catch {}

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

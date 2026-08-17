import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { redis } from '@/server/utils/redis'
import { clearSearchesCache } from '@/server/api/czone/[username]/searches.get'

const __dirname = dirname(fileURLToPath(import.meta.url))
// In production this file is at server/api/admin/backgrounds/ — 4 levels up to project root.
// In dev, process.cwd() is always the project root.
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

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

  // Collect affected search IDs before deletion so we can invalidate cache after
  const affectedPrizes = await db.cZoneSearchPrize.findMany({
    where: { conditionBackgrounds: { has: bg.filename } },
    select: { cZoneSearchId: true }
  })
  const affectedSearchIds = [...new Set(affectedPrizes.map(p => p.cZoneSearchId))]

  // Find affected CZone rows BEFORE opening the transaction. The CZone table
  // has no index on `background`/`layoutData`, so this predicate requires a
  // full-table scan with per-row JSONB unnesting — fine as a plain query (no
  // deadline), but ruinous inside a Prisma interactive transaction, whose
  // default 5s timeout it can blow past as the table grows, silently rolling
  // back the whole delete.
  const affectedCzones = await db.$queryRaw`
    SELECT id FROM "CZone"
    WHERE "background" = ${bg.imagePath}
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements("layoutData"->'zones') AS z
         WHERE z->>'background' = ${bg.imagePath}
       )
  `
  const affectedCzoneIds = affectedCzones.map((r) => r.id)

  // All DB operations run in a single transaction.
  // Junction rows with onDelete:Restrict must be deleted before the Background row.
  // File deletion happens AFTER the transaction commits so a DB failure never
  // leaves a missing file with a live DB record pointing at it.
  try {
    await db.$transaction(async (tx) => {
      await tx.achievementRewardBackground.deleteMany({ where: { backgroundId: id } })
      await tx.rewardBackground.deleteMany({ where: { backgroundId: id } })
      await tx.userBackground.deleteMany({ where: { backgroundId: id } })

      // Targeted by primary key (from the pre-computed list above) so this
      // stays fast — and within the transaction timeout — no matter how
      // large the CZone table is.
      if (affectedCzoneIds.length > 0) {
        // Clear CZone.background (top-level string column)
        await tx.$executeRaw`
          UPDATE "CZone"
          SET "background" = ''
          WHERE id = ANY(${affectedCzoneIds}) AND "background" = ${bg.imagePath}
        `

        // Remove background key from any zone objects inside CZone.layoutData.zones
        await tx.$executeRaw`
          UPDATE "CZone"
          SET "layoutData" = jsonb_set(
            "layoutData",
            '{zones}',
            COALESCE(
              (SELECT jsonb_agg(
                CASE WHEN zone->>'background' = ${bg.imagePath}
                  THEN zone - 'background'
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

      // Remove this background's filename from CZoneSearchPrize.conditionBackgrounds arrays
      await tx.$executeRaw`
        UPDATE "CZoneSearchPrize"
        SET "conditionBackgrounds" = array_remove("conditionBackgrounds", ${bg.filename})
        WHERE ${bg.filename} = ANY("conditionBackgrounds")
      `

      // All child rows cleared — safe to delete the Background row
      await tx.background.delete({ where: { id } })
    }, { timeout: 20000, maxWait: 5000 })
  } catch (err) {
    console.error('[backgrounds/delete] transaction failed:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete background' })
  }

  // DB committed — delete image file from disk (non-fatal if missing)
  try { await unlink(fsPathFromFilename(bg.filename)) } catch {}

  // Invalidate Redis cache for any cZone searches that had this background as a condition
  for (const searchId of affectedSearchIds) {
    try { await redis.del(`czone:search-meta:${searchId}`) } catch {}
  }
  if (affectedSearchIds.length > 0) clearSearchesCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'Background',
    key: 'delete',
    prevValue: bg.imagePath,
    newValue: null
  })

  return { ok: true }
})

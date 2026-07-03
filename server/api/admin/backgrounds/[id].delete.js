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

  // All DB operations run in a single transaction.
  // Junction rows with onDelete:Restrict must be deleted before the Background row.
  // File deletion happens AFTER the transaction commits so a DB failure never
  // leaves a missing file with a live DB record pointing at it.
  await db.$transaction(async (tx) => {
    await tx.achievementRewardBackground.deleteMany({ where: { backgroundId: id } })
    await tx.rewardBackground.deleteMany({ where: { backgroundId: id } })
    await tx.userBackground.deleteMany({ where: { backgroundId: id } })

    // Clear CZone.background (top-level string column)
    await tx.$executeRaw`
      UPDATE "CZone"
      SET "background" = ''
      WHERE "background" = ${bg.imagePath}
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
      WHERE jsonb_typeof("layoutData"->'zones') = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements("layoutData"->'zones') AS z
          WHERE z->>'background' = ${bg.imagePath}
        )
    `

    // Remove this background's filename from CZoneSearchPrize.conditionBackgrounds arrays
    await tx.$executeRaw`
      UPDATE "CZoneSearchPrize"
      SET "conditionBackgrounds" = array_remove("conditionBackgrounds", ${bg.filename})
      WHERE ${bg.filename} = ANY("conditionBackgrounds")
    `

    // All child rows cleared — safe to delete the Background row
    await tx.background.delete({ where: { id } })
  })

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

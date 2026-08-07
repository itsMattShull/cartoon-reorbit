// server/cron/czone-display-count.js
// Precomputes Ctoon.czoneDisplayCount — the number of distinct cZones that
// have a given cToon placed anywhere in their layout — so the cToon info
// modal (server/api/ctoon/modal.get.js) can read it directly instead of
// scanning every CZone.layoutData JSON blob on every modal open. Scheduled
// from sync-guild-members.js to run daily at 05:00 CST.
//
// layoutData shape: { zones: [ { background, toons: [ { id: <UserCtoon.id>, ... } ] } ] }.
// A placed toon's `id` is a UserCtoon id, not a Ctoon id, so resolving which
// cToon it refers to requires a join through UserCtoon.ctoonId. Burned
// UserCtoon rows are excluded from that join — burning doesn't remove the
// placement from CZone.layoutData (see prisma/cleanupBurnedCtoons.js), so an
// unfiltered join would keep counting a destroyed cToon as "on display".
// Older/legacy layoutData shapes (missing `zones`, non-array `toons`) are
// guarded with jsonb_typeof checks, matching the pattern already used in
// server/api/admin/backgrounds/[id]/usage.get.js.
//
// Both UPDATE statements run inside one transaction so a reader hitting the
// Ctoon row mid-run only ever sees the fully-old or fully-new count, never a
// transient zero from the reset half of the recompute.
import { prisma } from '../prisma.js'

const LOCK_KEY = 519284736 // arbitrary constant unique to this job, for pg_try_advisory_lock

const RECOMPUTE_SQL = `
  WITH counts AS (
    SELECT uc."ctoonId" AS ctoon_id, COUNT(DISTINCT cz."userId") AS cnt
    FROM "CZone" cz
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(cz."layoutData"->'zones') = 'array'
           THEN cz."layoutData"->'zones' ELSE '[]'::jsonb END
    ) AS zone
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(zone->'toons') = 'array'
           THEN zone->'toons' ELSE '[]'::jsonb END
    ) AS toon
    JOIN "UserCtoon" uc
      ON uc.id = (toon->>'id')
     AND uc."burnedAt" IS NULL
    GROUP BY uc."ctoonId"
  )
  UPDATE "Ctoon" c
  SET "czoneDisplayCount" = counts.cnt
  FROM counts
  WHERE c.id = counts.ctoon_id
`

export async function runCzoneDisplayCountAggregate() {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[czone-display-count] another run already holds the lock, skipping')
    return
  }
  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('UPDATE "Ctoon" SET "czoneDisplayCount" = 0'),
      prisma.$executeRawUnsafe(RECOMPUTE_SQL)
    ])
    console.log('[czone-display-count] recomputed czoneDisplayCount for all cToons')
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}

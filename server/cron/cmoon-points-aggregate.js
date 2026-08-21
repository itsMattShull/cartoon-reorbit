// server/cron/cmoon-points-aggregate.js
// Recomputes User.cMoonPoints — lifetime points contributed to a user's CURRENT cMoon — for
// every cMoon member, in one set-based statement (not a per-user loop: this job has no
// per-user side effects, unlike server/utils/cmoon.js's batch jobs, which loop because each
// iteration does a transactional row lock + a mint-queue side effect). Mirrors
// server/cron/czone-display-count.js's advisory-lock + recompute-via-UPDATE...FROM shape.
//
// "Contributed" = SUM of 'increase'-direction PointsLog rows since the user's current
// cMoonSelectedAt. Bounded by createdAt >= cMoonSelectedAt, not the user's whole history, so
// this is naturally scoped to their CURRENT cMoon tenure — an admin reassigning someone to a
// different cMoon means the next run starts summing from that new cMoonSelectedAt, with no
// explicit reset code needed. Spending points elsewhere (a 'decrease' row) never reduces it.
//
// Full idempotent recompute each run (not an incrementing cursor) — self-healing if a row is
// ever missed, at the cost of re-summing each member's whole current-cMoon-tenure history
// every run. That's the intentional tradeoff for a first cut of this feature; if PointsLog
// grows large enough for this to matter, revisit with a cursor keyed on PointsLog.id.
import { prisma } from '../prisma.js'
import { achievementsQueue } from '../utils/queues.js'

const LOCK_KEY = 719284511 // arbitrary constant unique to this job, for pg_try_advisory_lock

const RECOMPUTE_SQL = `
  WITH totals AS (
    SELECT u.id AS user_id, COALESCE(SUM(pl.points), 0) AS total
    FROM "User" u
    LEFT JOIN "PointsLog" pl
      ON pl."userId" = u.id
     AND pl.direction = 'increase'
     AND pl."createdAt" >= u."cMoonSelectedAt"
    WHERE u."cMoonId" IS NOT NULL
    GROUP BY u.id
  )
  UPDATE "User" u
  SET "cMoonPoints" = totals.total
  FROM totals
  WHERE u.id = totals.user_id
    AND u."cMoonPoints" IS DISTINCT FROM totals.total
  RETURNING u.id
`

export async function runCMoonPointsAggregate() {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[cmoon-points-aggregate] another run already holds the lock, skipping')
    return { changed: 0 }
  }

  try {
    const changedRows = await prisma.$queryRawUnsafe(RECOMPUTE_SQL)
    const changedUserIds = changedRows.map(r => r.id)

    // A points-total change is the only thing that can newly satisfy a cMoonPointsGte
    // achievement, so this is the trigger for re-evaluating those users well before the
    // once-daily enqueueAchievementsDaily batch would otherwise reach them.
    for (const userId of changedUserIds) {
      try {
        await achievementsQueue.add('processUserAchievements', { userId })
      } catch (err) {
        console.error('[cmoon-points-aggregate] failed to enqueue achievement check', { userId, error: err?.message })
      }
    }

    console.log(`[cmoon-points-aggregate] recomputed cMoonPoints, ${changedUserIds.length} user(s) changed`)
    return { changed: changedUserIds.length }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}

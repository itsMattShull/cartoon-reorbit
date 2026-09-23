// server/cron/cmoon-points-aggregate.js
// Recomputes User.cMoonPoints — the value the individual cMoon rank ladder (CMoonRankTier /
// CMoonRank, see server/utils/cmoonRankTiers.js) is measured against — for every cMoon member,
// in one set-based statement (not a per-user loop: this job has no per-user side effects, unlike
// server/utils/cmoon.js's batch jobs, which loop because each iteration does a transactional row
// lock + a mint-queue side effect). Mirrors server/cron/czone-display-count.js's advisory-lock +
// recompute-via-UPDATE...FROM shape.
//
// "Contributed" = SUM of this user's own CMoonScoreLog rows for their CURRENT cMoon since their
// current cMoonSelectedAt — i.e. exactly the same admin-configurable categories that build the
// weekly TEAM score (HIGH_SCORE: holding #1 on an eligible game; TOP10: a top-N finish on the
// Points/Total cToons board; DAILY_TASK: completing a daily task), see runDailyCMoonScoring in
// server/utils/cmoon.js and Admin > cMoons > Scoring Rules. Deliberately NOT derived from
// PointsLog (every point a player earns from anything) as it previously was — that let a
// brand-new account's large first-week login bonus, or points simply received from another
// player via trade/auction, buy rank progress with no real skill or teamwork behind it, putting
// veteran and new/inactive accounts on very uneven footing. Sourcing rank progress from the same
// pool the team leaderboard uses means every player, regardless of account age or point balance,
// advances their rank the same way: by actually placing on a leaderboard or showing up daily —
// and the minimum-account-age gate that already guards weekly scoring (CMOON_SCORING_DEFAULTS.
// minAccountAgeDays) means a too-new account earns no rank progress at all yet, rather than a
// head start.
//
// Bounded by createdAt >= cMoonSelectedAt (CMoonScoreLog.createdAt is set when the weekly cron
// batch-inserts that week's awards), not the user's whole history, so this is naturally scoped
// to their CURRENT cMoon tenure — an admin reassigning someone to a different cMoon means the
// next run starts summing from that new cMoonSelectedAt, with no explicit reset code needed.
// Also joined on csl."cMoonId" = u."cMoonId" (current membership) since a CMoonScoreLog row is
// permanently tagged with whichever cMoon the player belonged to when it was awarded — a player
// who has since left that cMoon (or been moved out of it) never has its old rows counted again,
// matching every other reassignment invariant this feature relies on (see reassignUserCMoon's
// own comment in server/utils/cmoon.js).
//
// Full idempotent recompute each run (not an incrementing cursor) — self-healing if a row is
// ever missed, at the cost of re-summing each member's whole current-cMoon-tenure history every
// run. CMoonScoreLog is tiny per user (a handful of rows per week) compared to PointsLog, so this
// is cheaper than the PointsLog-based version it replaces, not more expensive.
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { achievementsQueue } from '../utils/queues.js'
import { USER_TABLE_BULK_WRITE_LOCK_KEY } from '../utils/dbLocks.js'

// Shared with recomputeLastActivity (server/cron/sync-guild-members.js) — see
// server/utils/dbLocks.js. Both do a full-table UPDATE...FROM against "User"
// and used to be able to land in the same tick and deadlock each other.
const LOCK_KEY = USER_TABLE_BULK_WRITE_LOCK_KEY

const RECOMPUTE_SQL = `
  WITH totals AS (
    SELECT u.id AS user_id, COALESCE(SUM(csl.points), 0) AS total
    FROM "User" u
    LEFT JOIN "CMoonScoreLog" csl
      ON csl."userId" = u.id
     AND csl."cMoonId" = u."cMoonId"
     AND csl."createdAt" >= u."cMoonSelectedAt"
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

async function enqueueAchievementChecks(changedUserIds) {
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
}

export async function runCMoonPointsAggregate() {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[cmoon-points-aggregate] another run already holds the lock, skipping')
    return { changed: 0 }
  }

  try {
    const changedRows = await prisma.$queryRawUnsafe(RECOMPUTE_SQL)
    const changedUserIds = changedRows.map(r => r.id)
    await enqueueAchievementChecks(changedUserIds)
    console.log(`[cmoon-points-aggregate] recomputed cMoonPoints, ${changedUserIds.length} user(s) changed`)
    return { changed: changedUserIds.length }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}

// Same recompute as runCMoonPointsAggregate, scoped to a specific set of just-affected users —
// used by the live DAILY_TASK award path (see recordDailyTaskCompletions in
// server/utils/cmoon.js) so a player's rank bar reflects a completion within moments rather than
// waiting for this job's own next scheduled tick. No advisory lock: unlike the full recompute,
// this only ever touches rows for the userIds the caller just awarded, so two overlapping calls
// (this scoped path and the periodic full sweep) can safely run concurrently — same UPDATE...FROM
// idempotence the full recompute already relies on.
export async function recomputeCMoonPointsForUsers(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return { changed: 0 }

  const changedRows = await prisma.$queryRaw`
    WITH totals AS (
      SELECT u.id AS user_id, COALESCE(SUM(csl.points), 0) AS total
      FROM "User" u
      LEFT JOIN "CMoonScoreLog" csl
        ON csl."userId" = u.id
       AND csl."cMoonId" = u."cMoonId"
       AND csl."createdAt" >= u."cMoonSelectedAt"
      WHERE u."cMoonId" IS NOT NULL AND u.id IN (${Prisma.join(ids)})
      GROUP BY u.id
    )
    UPDATE "User" u
    SET "cMoonPoints" = totals.total
    FROM totals
    WHERE u.id = totals.user_id
      AND u."cMoonPoints" IS DISTINCT FROM totals.total
    RETURNING u.id
  `
  const changedUserIds = changedRows.map(r => r.id)
  await enqueueAchievementChecks(changedUserIds)
  return { changed: changedUserIds.length }
}

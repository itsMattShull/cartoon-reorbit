// server/utils/activePlayers.js
//
// Shared definitions of "active player," all keyed off User.lastActivity. Plain account.active
// (not dissolved/banned) alone includes every account that has ever existed, even one that logged
// in once years ago and never came back — lastActivity is a much stronger signal the account
// belongs to someone still actually playing. It's kept fresh by the recomputeLastActivity cron job
// (server/cron/jobHandlers.js), which sets it to the most recent of login, points activity, game
// activity, site visits, and wheel spins — the same field the dormancy-warning/enforcement jobs
// and the admin retention report already rely on.
//
// Two windows live here:
//  - The trailing-14-day count/stats: the Economy page's "Avg Points / Active Player" tile
//    (server/api/economy/summary.get.js).
//  - The "prior week" count/stats (active 7-14 days ago, not the still-accumulating last few
//    days): the cMart Metrics page and its "fill from active players" button
//    (server/utils/cmartStandardizedMetrics.js) — a settled, less volatile cohort to base a mint
//    quantity suggestion on than whatever just happened today.
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { EXCLUDED_SYSTEM_USER_ID } from './economyValuation.js'

const COMMON_ACTIVE_FILTERS = Prisma.sql`
  u."active" = true
  AND COALESCE(u."banned", false) = false
  AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
`

export const ACTIVE_PLAYER_WINDOW_DAYS = 14

const ACTIVE_PLAYER_WHERE = Prisma.sql`
  ${COMMON_ACTIVE_FILTERS}
  AND u."lastActivity" >= NOW() - make_interval(days => ${ACTIVE_PLAYER_WINDOW_DAYS}::int)
`

/** Count of active players right now (see module header for the definition). */
export async function getActivePlayerCount() {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "count"
    FROM "User" u
    WHERE ${ACTIVE_PLAYER_WHERE}
  `
  return Number(rows?.[0]?.count || 0)
}

/**
 * Average and median UserPoints.points among active players. Median alongside the mean: point
 * balances are heavily right-skewed, so the mean alone overstates what a typical player actually
 * holds.
 */
export async function getActivePlayerPointsStats() {
  const rows = await prisma.$queryRaw`
    SELECT
      AVG(up."points")::float AS "avgPoints",
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY up."points"))::float AS "medianPoints"
    FROM "UserPoints" up
    JOIN "User" u ON u.id = up."userId"
    WHERE ${ACTIVE_PLAYER_WHERE}
  `
  return {
    avgPoints: Math.round((rows?.[0]?.avgPoints || 0) * 100) / 100,
    medianPoints: Math.round(rows?.[0]?.medianPoints || 0)
  }
}

// "Prior week" window: active sometime between 14 and 7 days ago. Deliberately excludes the
// most recent 7 days so a cToon's suggested mint quantity isn't skewed by this week's
// still-accumulating activity or a short-lived spike right before it's priced.
export const PRIOR_WEEK_WINDOW_START_DAYS = 14
export const PRIOR_WEEK_WINDOW_END_DAYS = 7

const PRIOR_WEEK_WHERE = Prisma.sql`
  ${COMMON_ACTIVE_FILTERS}
  AND u."lastActivity" >= NOW() - make_interval(days => ${PRIOR_WEEK_WINDOW_START_DAYS}::int)
  AND u."lastActivity" <  NOW() - make_interval(days => ${PRIOR_WEEK_WINDOW_END_DAYS}::int)
`

/** Count of unique players active in the prior-week window (see module header). */
export async function getPriorWeekActivePlayerCount() {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "count"
    FROM "User" u
    WHERE ${PRIOR_WEEK_WHERE}
  `
  return Number(rows?.[0]?.count || 0)
}

/** Average and median UserPoints.points among prior-week active players. */
export async function getPriorWeekActivePlayerPointsStats() {
  const rows = await prisma.$queryRaw`
    SELECT
      AVG(up."points")::float AS "avgPoints",
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY up."points"))::float AS "medianPoints"
    FROM "UserPoints" up
    JOIN "User" u ON u.id = up."userId"
    WHERE ${PRIOR_WEEK_WHERE}
  `
  return {
    avgPoints: Math.round((rows?.[0]?.avgPoints || 0) * 100) / 100,
    medianPoints: Math.round(rows?.[0]?.medianPoints || 0)
  }
}

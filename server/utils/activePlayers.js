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
// One trailing-14-day window, used everywhere "active player" is counted on the site: the
// Economy page's "Avg Points / Active Player" tile (server/api/economy/summary.get.js) and the
// cMart Metrics page's "fill from active players" button (server/utils/cmartStandardizedMetrics.js).
// An earlier version of the cMart Metrics feature counted only a narrower "settled" sub-window —
// active 7-14 days ago, deliberately excluding the still-accumulating current week — specifically
// to avoid a short-lived spike skewing a mint-quantity suggestion. In practice that just made the
// count look wrong: it reads as a materially smaller, unexplained number next to the same-named
// "active players" stat everywhere else on the site (which counts the full last 14 days,
// including this week), so it was reverted in favor of the one shared definition below.
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

// server/utils/activePlayers.js
//
// Shared definition of "active player": User.lastActivity falls within the trailing window.
// Plain account.active (not dissolved/banned) alone includes every account that has ever existed,
// even one that logged in once years ago and never came back — lastActivity is a much stronger
// signal the account belongs to someone still actually playing. It's kept fresh by the
// recomputeLastActivity cron job (server/cron/jobHandlers.js), which sets it to the most recent of
// login, points activity, game activity, site visits, and wheel spins — the same field the
// dormancy-warning/enforcement jobs and the admin retention report already rely on.
//
// Used by the Economy page's "Avg Points / Active Player" tile (server/api/economy/summary.get.js)
// and the cMart "Standardize Metric" mint-quantity calculation
// (server/utils/cmartStandardizedMetrics.js) — both need the exact same definition of "active," so
// it lives here once rather than being duplicated.
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { EXCLUDED_SYSTEM_USER_ID } from './economyValuation.js'

export const ACTIVE_PLAYER_WINDOW_DAYS = 14

const ACTIVE_PLAYER_WHERE = Prisma.sql`
  u."active" = true
  AND COALESCE(u."banned", false) = false
  AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
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

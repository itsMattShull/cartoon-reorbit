// server/utils/gamePoints.js
// Shared daily-capped point award logic. TKO and gToons Clash wins share a
// single daily cap ("combat" pool, tracked via GamePointLog.gameName in
// ['TKO', 'Clash']) while other games (Winball, ReOrbit Match, monster
// scans) share a separate general pool.
import { getDailyWindowStart } from './centralTime.js'

/**
 * Awards up to `pointsPerWin` points to a user, capped by how much of `cap`
 * remains in the current daily window across `poolGameNames` (defaults to
 * just `gameName`). Must be called with an open Prisma interactive
 * transaction so the cap check and writes are atomic; takes an advisory
 * lock on the userId so concurrent award paths (e.g. the TKO webhook and a
 * Clash match ending at the same moment) can't both read a stale "used"
 * total and jointly exceed the shared cap.
 *
 * Returns the number of points actually awarded (0 if the pool is exhausted).
 */
export async function awardCappedGamePoints(tx, { userId, gameName, poolGameNames, pointsPerWin, cap, method }) {
  const toAward = Number(pointsPerWin || 0)
  const dailyCap = Number(cap || 0)
  if (!userId || toAward <= 0 || dailyCap <= 0) return 0

  const names = poolGameNames && poolGameNames.length ? poolGameNames : [gameName]
  const windowStart = getDailyWindowStart()

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

  const agg = await tx.gamePointLog.aggregate({
    where: { userId, gameName: { in: names }, createdAt: { gte: windowStart } },
    _sum: { points: true }
  })
  const used = Number(agg._sum.points || 0)
  const remaining = Math.max(0, dailyCap - used)
  const toGive = Math.max(0, Math.min(toAward, remaining))
  if (toGive <= 0) return 0

  await tx.gamePointLog.create({ data: { userId, points: toGive, gameName } })
  const updated = await tx.userPoints.upsert({
    where: { userId },
    create: { userId, points: toGive },
    update: { points: { increment: toGive } }
  })
  await tx.pointsLog.create({
    data: { userId, points: toGive, total: updated.points, method, direction: 'increase' }
  })

  return toGive
}

// TKO and gToons Clash wins draw from the same daily "combat" pool.
export const COMBAT_POOL_GAME_NAMES = ['TKO', 'Clash']

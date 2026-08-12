// server/utils/gamePoints.js
// Shared daily-capped point award logic. The head-to-head games — TKO, gToons Clash,
// Ed, Edd n Eddy RPS and ReOrbit Chess — share a single daily cap ("combat" pool, tracked via
// GamePointLog.gameName in COMBAT_POOL_GAME_NAMES) while other games (Winball, ReOrbit
// Match, monster scans) share a separate general pool.
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

// The head-to-head games draw from the same daily "combat" pool.
//
// This constant has two jobs, and adding a game to it is never optional once that game logs
// GamePointLog rows. Every combat game passes it as `poolGameNames` above (an INCLUSION), and
// every general-pool game — plus onboarding's daily quest counters — uses it as a
// `notIn` EXCLUSION. Award from a combat game without listing it here and the points are
// charged to BOTH pools: the full combat cap is still available, and the arcade games
// silently lose that much of their own budget.
export const COMBAT_POOL_GAME_NAMES = ['TKO', 'Clash', 'EdRps', 'ReOrbitChess']

/**
 * Awards points from the GENERAL daily pool — everything that is not a combat-pool game
 * (Winball, ReOrbit Match, Tower Stack, ReOrbit Memory, Flappy Powerpuff, monster scans).
 *
 * This is the mirror image of `awardCappedGamePoints`: that one sums `gameName IN (names)`,
 * which is right for the combat pool but wrong here — the general pool is defined by
 * EXCLUSION, so summing only this game's own rows would hand each game its own private cap
 * and inflate the site-wide daily total. Passing a general-pool game to
 * `awardCappedGamePoints` is a bug, not a shortcut.
 *
 * Like its sibling it must be called inside an open interactive transaction, and it takes the
 * same advisory lock on the userId first. That lock is the point: the per-game Redis locks
 * used by the arcade endpoints are keyed per game, so without it a player can finish Tower
 * Stack, ReOrbit Memory and Flappy simultaneously, have all three transactions read
 * `usedToday = 0` under READ COMMITTED, and collect three games' worth of points against one
 * shared cap.
 *
 * Returns the number of points actually awarded (0 if the pool is exhausted).
 */
export async function awardGeneralPoolGamePoints(tx, { userId, gameName, pointsPerGame, cap, method }) {
  const toAward = Number(pointsPerGame || 0)
  const dailyCap = Number(cap || 0)
  if (!userId || toAward <= 0 || dailyCap <= 0) return 0

  const windowStart = getDailyWindowStart()

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

  const agg = await tx.gamePointLog.aggregate({
    where: {
      userId,
      createdAt: { gte: windowStart },
      OR: [{ gameName: null }, { gameName: { notIn: COMBAT_POOL_GAME_NAMES } }]
    },
    _sum: { points: true }
  })
  const used = Number(agg._sum.points || 0)
  const toGive = Math.max(0, Math.min(toAward, Math.max(0, dailyCap - used)))
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

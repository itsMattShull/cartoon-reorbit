// Shared server runtime for "Guess that cToon!" — config loading, Redis keys, and the
// single place a run is turned into a score row plus a points award.
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { getDailyWindowStart } from '@/server/utils/centralTime'
import { COMBAT_POOL_GAME_NAMES } from '@/server/utils/gamePoints'
import { DEFAULTS, CHOICES_MIN, CHOICES_MAX, scoreCadence, MIN_ANSWER_INTERVAL_MS } from '@/server/utils/guessCtoonEngine'

const GAME_NAME = 'GuessCtoon'
const POINTS_METHOD = 'Game - Guess That cToon'

// How long a banked session stays readable before Redis drops it. Long enough that the
// game-over screen can still be reconciled, short enough that it isn't a leak.
const BANKED_TTL_SECONDS = 120

export function sessionKey (userId) { return `guessctoon:session:${userId}` }
export function lockKey (userId) { return `guessctoon:lock:${userId}` }

// GameConfig for this game is one small row read on every /start and /status. Cached
// in-process to absorb bursts, mirroring server/middleware/daily-points.js.
//
// The TTL is deliberately short: the app runs multiple PM2 instances, so an admin saving
// on the Games page cannot reliably invalidate every instance's copy. Bounding staleness
// to well under a minute is simpler and more predictable than a cross-process bust, and
// the read it saves is a single indexed lookup on a tiny table.
let cachedConfig = null
let cachedConfigAt = 0
const CONFIG_TTL_MS = 20 * 1000

export async function getGuessCtoonConfig () {
  const now = Date.now()
  if (cachedConfig && (now - cachedConfigAt) < CONFIG_TTL_MS) return cachedConfig

  let row = null
  try {
    row = await prisma.gameConfig.findUnique({ where: { gameName: GAME_NAME } })
  } catch {
    // Fall through to defaults — a config read failure should not take the game down.
  }

  const config = {
    scoredPlaysPerPeriod: clampInt(row?.guessCtoonScoredPlaysPerPeriod, 0, 100, DEFAULTS.scoredPlaysPerPeriod),
    pointsPerGame: clampInt(row?.guessCtoonPointsPerGame, 0, 100000, DEFAULTS.pointsPerGame),
    secondsPerQuestion: clampInt(row?.guessCtoonSecondsPerQuestion, 4, 120, DEFAULTS.secondsPerQuestion),
    choices: clampInt(row?.guessCtoonChoices, CHOICES_MIN, CHOICES_MAX, DEFAULTS.choices),
    maxQuestions: clampInt(row?.guessCtoonMaxQuestions, 5, 100, DEFAULTS.maxQuestions),
    minStreakForPoints: clampInt(row?.guessCtoonMinStreakForPoints, 0, 100, DEFAULTS.minStreakForPoints)
  }

  cachedConfig = config
  cachedConfigAt = now
  return config
}

function clampInt (value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function getDailyBoundary () {
  return getDailyWindowStart()
}

export function getNextResetAt (boundary) {
  return new Date(boundary.getTime() + 24 * 60 * 60 * 1000)
}

export function getWeekBoundary () {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  const dow = chicagoNow.weekday % 7 // luxon: Mon=1…Sun=7; we want Mon=0
  const monday = chicagoNow
    .minus({ days: dow === 0 ? 6 : dow - 1 })
    .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
  return monday.toUTC().toJSDate()
}

/**
 * Records a finished run and awards points.
 *
 * Callers must already have won the atomic flip to `banked` in Redis (ANSWER_SCRIPT on a
 * terminal answer, BANK_SCRIPT on cash-out), so exactly one caller ever reaches this for a
 * given run.
 *
 * Points are gated on `minStreakForPoints`: without it, POST /start immediately followed by
 * POST /end would pay the full per-game award for answering nothing, which is the same
 * failure the ReOrbit Memory handler guards against when it refuses to score an incomplete
 * board. A score row is still written for any streak — it's the *award* that is gated.
 */
export async function bankRun ({ userId, streak, latencies, startedAt, config, counted = true }) {
  const finalStreak = Math.max(0, Math.min(Number(streak) || 0, config.maxQuestions))
  const cadence = scoreCadence(latencies)
  const isCounted = counted !== false

  // Wall-clock floor, mirroring the belt-and-suspenders check in reorbitmemory/end: a run
  // cannot have taken less time than its own minimum answer pacing allows.
  let suspicious = cadence.suspicious
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs < finalStreak * MIN_ANSWER_INTERVAL_MS) suspicious = true
  }

  await prisma.guessCtoonScore.create({
    data: {
      userId,
      streak: finalStreak,
      counted: isCounted,
      suspicious,
      medianAnswerMs: cadence.median ?? null,
      stdDevAnswerMs: cadence.stdDev ?? null
    }
  })

  // Practice runs (played past the daily scored-play cap) are recorded for the player's own
  // history but never pay out and never reach the leaderboard.
  let pointsAwarded = 0
  if (isCounted && finalStreak >= config.minStreakForPoints && config.pointsPerGame > 0) {
    pointsAwarded = await awardPoints(userId, config.pointsPerGame)
  }

  return { streak: finalStreak, pointsAwarded, suspicious, counted: isCounted }
}

/**
 * Awards up to `pointsPerGame`, capped by what remains of the shared daily general pool.
 *
 * The pool filter is a DENYLIST (everything that isn't TKO/Clash), matching every other
 * general-pool game. Using an allowlist of just this game's name would give the player a
 * whole extra daily allowance on top of Winball/Match/Memory/Tower rather than a share of
 * the same one.
 *
 * The advisory lock serializes concurrent awards for the same user across games. Without
 * it, two general-pool games finishing in the same millisecond both read the same stale
 * "used today" total under READ COMMITTED and jointly blow through the cap.
 */
async function awardPoints (userId, pointsPerGame) {
  let awarded = 0
  try {
    const globalConfig = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    const dailyLimit = globalConfig?.dailyPointLimit ?? 100
    const capped = Math.min(pointsPerGame, dailyLimit)
    if (capped <= 0) return 0

    const boundary = getDailyBoundary()

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

      const agg = await tx.gamePointLog.aggregate({
        where: {
          userId,
          createdAt: { gte: boundary },
          OR: [{ gameName: null }, { gameName: { notIn: COMBAT_POOL_GAME_NAMES } }]
        },
        _sum: { points: true }
      })
      const usedToday = Number(agg._sum?.points || 0)
      const toGive = Math.min(capped, Math.max(0, dailyLimit - usedToday))
      awarded = toGive

      if (toGive > 0) {
        await tx.gamePointLog.create({ data: { userId, points: toGive, gameName: GAME_NAME } })
        const updated = await tx.userPoints.upsert({
          where: { userId },
          create: { userId, points: toGive },
          update: { points: { increment: toGive } }
        })
        await tx.pointsLog.create({
          data: {
            userId,
            direction: 'increase',
            points: toGive,
            total: updated.points,
            method: POINTS_METHOD
          }
        })
      }
    })
  } catch {
    // Points award failure is non-fatal — the score is already recorded.
    return awarded
  }
  return awarded
}

/**
 * Loads the user and rejects anyone who must not be earning: deleted (the JWT outlives the
 * row), banned, or deactivated. `user?.banned` alone would let a deleted user straight
 * through, since undefined is falsy.
 */
export async function assertPlayable (userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { banned: true, active: true }
  })
  if (!user) return 'Account not found'
  if (user.banned) return 'Account suspended'
  if (user.active === false) return 'Account inactive'
  return null
}

export { GAME_NAME, POINTS_METHOD, BANKED_TTL_SECONDS }

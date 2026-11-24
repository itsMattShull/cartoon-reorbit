// server/utils/dailyTaskStatus.js
// The "is each daily task complete" computation, extracted verbatim from
// server/api/onboarding/daily.get.js so that endpoint and server/utils/dailyStreak.js (which
// needs the exact same per-task booleans to decide "did this player finish EVERY task today")
// can never silently drift apart on what "complete" means for a given task.
//
// Relative imports only, NOT the `@/` alias: dailyStreak.js's processDailyStreaks() is called
// from server/cron/process-daily-streaks.js, a plain `node` entrypoint (see the import-rules
// header comment in server/utils/notifications.js for the same constraint) that cannot resolve
// Nuxt/Vite's `@/` alias. Takes `db` as a parameter for the same reason.
import { Prisma } from '@prisma/client'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from './dailyTaskWindows.js'
import { COMBAT_POOL_GAME_NAMES } from './gamePoints.js'

// Which WheelSpinLog rows count as a real spin for the Winwheel task — shared between the two
// batch functions' own wheel CTEs below (they differ only in their time bound, capped vs not),
// so this one business rule can't silently drift between them.
const VALID_SPIN_SQL = Prisma.sql`"status" <> 'failed' AND "result" <> 'tripleNothing'`

// Shared by every function in this file that needs the admin-configured thresholds — fetched
// ONCE per caller (a single cron tick, or one live request), never per user. The batch functions
// below exist specifically so a caller checking many users in one pass (server/utils/
// dailyStreak.js's cron) fetches this exactly once for the whole batch, not once per user.
export async function fetchTaskConfig(db) {
  const [globalConfig, winwheelConfig, lottoSettings] = await Promise.all([
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        dailyLoginPoints: true,
        dailyPointLimit: true,
        tkoDailyPointLimit: true,
        czoneVisitMaxPerDay: true,
        czoneVisitPoints: true
      }
    }),
    db.gameConfig.findUnique({ where: { gameName: 'Winwheel' }, select: { maxDailySpins: true } }),
    db.lottoSettings.findUnique({ where: { id: 'lotto' }, select: { countPerDay: true } })
  ])
  return {
    dailyLoginPoints: Number(globalConfig?.dailyLoginPoints ?? 500),
    dailyPointLimit: Number(globalConfig?.dailyPointLimit ?? 250),
    tkoDailyPointLimit: Number(globalConfig?.tkoDailyPointLimit ?? 250),
    czoneVisitMaxPerDay: Number(globalConfig?.czoneVisitMaxPerDay ?? 10),
    czoneVisitPoints: Number(globalConfig?.czoneVisitPoints ?? 20),
    winwheelMaxDailySpins: Number(winwheelConfig?.maxDailySpins ?? 0),
    lottoCountPerDay: Number(lottoSettings?.countPerDay ?? 0)
  }
}

/**
 * Returns `{ status, counts, config }` for one user — identical shape to daily.get.js's own
 * response body. `asOf` (default: now) lets a caller evaluate a past instant's boundary, same
 * convention as getChicagoDailyBoundary's own `asOf` parameter.
 *
 * `windowEnd`, if given, caps the four EVENING-boundary-rooted queries (login/czone visits/game
 * points/TKO points) at `createdAt < windowEnd` — needed only by a caller evaluating a CLOSED
 * historical window after the fact (server/utils/dailyStreak.js's nightly cron), since the live
 * endpoint (daily.get.js, no windowEnd) is always asking "as of right now", where "now" is
 * already the correct upper bound with nothing to cap. Deliberately NOT applied to the
 * winwheel/lotto queries by default: their own window is rooted at the 8am boundary and runs
 * until the NEXT 8am, which — unlike the 8pm-rooted tasks — has NOT yet closed at the 8pm instant
 * the streak cron's EVENING pass evaluates, so capping them the same way there would wrongly
 * exclude same-day activity that still legitimately counts.
 *
 * `morningWindowEnd`, if given, caps the two MORNING-boundary-rooted queries (Winwheel/Lotto) at
 * `createdAt < morningWindowEnd` instead — used only by the streak cron's separate ~8:05am
 * resolution pass (server/cron/resolve-pending-daily-streaks.js), which evaluates a specific
 * CLOSED morning window the evening pass deliberately deferred a verdict on (see
 * User.dailyStreakPendingBoundary's own schema comment). Lotto completion in that capped case is
 * resolved from LottoLog — an immutable per-purchase log — rather than LottoUser.purchasesToday/
 * lastReset, which is a live, continuously-overwritten counter: by the time this resolution pass
 * runs, the NEW morning window (which started the moment the old one closed) may already have its
 * own purchase in progress, and reading the live counter at that point would misattribute it to
 * the window being resolved. The live/default (no morningWindowEnd) path is unaffected and keeps
 * reading the live counter exactly as before, which is correct for "as of right now".
 */
export async function computeDailyTaskStatus(db, userId, { asOf = new Date(), windowEnd = null, morningWindowEnd = null } = {}) {
  const {
    dailyLoginPoints, dailyPointLimit, tkoDailyPointLimit,
    czoneVisitMaxPerDay, czoneVisitPoints, winwheelMaxDailySpins, lottoCountPerDay
  } = await fetchTaskConfig(db)

  const dailyWindowStart = getChicagoDailyBoundary(asOf)
  const morningWindowStart = getChicagoMorningWindowStart(asOf)
  const eveningCreatedAt = windowEnd ? { gte: dailyWindowStart, lt: windowEnd } : { gte: dailyWindowStart }
  const morningCreatedAt = morningWindowEnd ? { gte: morningWindowStart, lt: morningWindowEnd } : { gte: morningWindowStart }

  const [
    dailyLoginCount,
    czoneVisitCount,
    gamePointAgg,
    tkoPointAgg,
    winwheelSpins,
    lottoUser,
    closedWindowLottoCount
  ] = await Promise.all([
    db.pointsLog.count({
      where: { userId, method: 'Daily Login', createdAt: eveningCreatedAt }
    }),
    db.pointsLog.count({
      where: { userId, method: 'cZone Visit', createdAt: eveningCreatedAt }
    }),
    db.gamePointLog.aggregate({
      where: {
        userId,
        createdAt: eveningCreatedAt,
        OR: [{ gameName: null }, { gameName: { notIn: COMBAT_POOL_GAME_NAMES } }]
      },
      _sum: { points: true }
    }),
    db.gamePointLog.aggregate({
      where: { userId, gameName: { in: COMBAT_POOL_GAME_NAMES }, createdAt: eveningCreatedAt },
      _sum: { points: true }
    }),
    db.wheelSpinLog.count({
      where: { userId, createdAt: morningCreatedAt, status: { not: 'failed' }, result: { not: 'tripleNothing' } }
    }),
    morningWindowEnd ? null : db.lottoUser.findUnique({
      where: { userId },
      select: { purchasesToday: true, lastReset: true }
    }),
    morningWindowEnd ? db.lottoLog.count({ where: { userId, createdAt: morningCreatedAt } }) : null
  ])

  const gamePointsUsed = Number(gamePointAgg?._sum?.points || 0)
  const tkoPointsUsed = Number(tkoPointAgg?._sum?.points || 0)

  let lottoPurchasesToday
  if (morningWindowEnd) {
    lottoPurchasesToday = Number(closedWindowLottoCount || 0)
  } else {
    const lastResetAt = lottoUser?.lastReset ? new Date(lottoUser.lastReset) : null
    lottoPurchasesToday = (lastResetAt && lastResetAt.getTime() >= morningWindowStart.getTime())
      ? Number(lottoUser?.purchasesToday || 0)
      : 0
  }

  const status = {
    dailyLoginComplete: dailyLoginCount > 0,
    czoneVisitComplete: czoneVisitMaxPerDay > 0 && czoneVisitCount >= czoneVisitMaxPerDay,
    gamePointsComplete: dailyPointLimit > 0 && gamePointsUsed >= dailyPointLimit,
    tkoPointsComplete: tkoDailyPointLimit > 0 && tkoPointsUsed >= tkoDailyPointLimit,
    winwheelComplete: winwheelMaxDailySpins > 0 && winwheelSpins >= winwheelMaxDailySpins,
    lottoComplete: lottoCountPerDay !== -1 && lottoCountPerDay > 0 && lottoPurchasesToday >= lottoCountPerDay
  }

  return {
    config: {
      dailyLoginPoints,
      dailyPointLimit,
      tkoDailyPointLimit,
      czoneVisitMaxPerDay,
      czoneVisitPoints,
      winwheelMaxDailySpins,
      lottoCountPerDay
    },
    status,
    counts: {
      dailyLoginCount,
      czoneVisitCount,
      gamePointsUsed,
      tkoPointsUsed,
      winwheelSpins,
      lottoPurchasesToday
    }
  }
}

// dailyLoginComplete has no admin "limit" to disable it with (see the status object above) — it's
// the one task that's always real, so every OTHER task is only "enabled" (and therefore required
// for the completeness checks below) when its own admin-configured limit is > 0, mirroring the
// exact skip rule daily.get.js's own status booleans already encode (a `false` from an always-0
// limit means "not applicable", not "incomplete"). Split into evening- vs morning-boundary-rooted
// groups (see dailyTaskWindows.js's own header comment on why these two clocks exist at all) so
// server/utils/dailyStreak.js's nightly cron can judge "did they finish everything that resets at
// 8pm" immediately, while deferring the verdict on whichever of these two morning-rooted tasks is
// still enabled-but-incomplete until their own 8am deadline has actually passed (see
// User.dailyStreakPendingBoundary's own schema comment) instead of cutting them off early.
const EVENING_TASK_ENABLED_BY = Object.freeze({
  czoneVisitComplete: (config) => config.czoneVisitMaxPerDay > 0,
  gamePointsComplete: (config) => config.dailyPointLimit > 0,
  tkoPointsComplete: (config) => config.tkoDailyPointLimit > 0
})
const MORNING_TASK_ENABLED_BY = Object.freeze({
  winwheelComplete: (config) => config.winwheelMaxDailySpins > 0,
  lottoComplete: (config) => config.lottoCountPerDay !== -1 && config.lottoCountPerDay > 0
})

/** True iff daily login plus every ENABLED evening-rooted task (login/czone/game points/TKO
 * points) is complete. Says nothing about Winwheel/Lotto — see allEnabledMorningTasksComplete. */
export function allEnabledEveningTasksComplete({ status, config }) {
  if (!status.dailyLoginComplete) return false
  for (const [key, isEnabled] of Object.entries(EVENING_TASK_ENABLED_BY)) {
    if (isEnabled(config) && !status[key]) return false
  }
  return true
}

/** True iff every ENABLED morning-rooted task (Winwheel/Lotto) is complete. True vacuously when
 * both are disabled — mirrors allEnabledEveningTasksComplete's own "0 = not a real task" rule. */
export function allEnabledMorningTasksComplete({ status, config }) {
  for (const [key, isEnabled] of Object.entries(MORNING_TASK_ENABLED_BY)) {
    if (isEnabled(config) && !status[key]) return false
  }
  return true
}

/** True iff every ENABLED task of EITHER group is complete (dailyLoginComplete always counts; the
 * rest only when their own admin-configured limit is > 0). An admin with every optional task
 * disabled still requires at least daily login. */
export function allEnabledDailyTasksComplete({ status, config }) {
  return allEnabledEveningTasksComplete({ status, config }) && allEnabledMorningTasksComplete({ status, config })
}

// ── Batch versions, for a cron checking many users in one pass ─────────────────────────────────
//
// computeDailyTaskStatus above does 6 queries PER USER — fine for a single live page load
// (daily.get.js), but server/utils/dailyStreak.js's nightly cron can have thousands of
// candidates, and calling computeDailyTaskStatus once per candidate in a loop would mean
// thousands of sequential round trips (plus the config fetch redundantly re-run for every one of
// them). server/utils/cmoon.js's own daily-task cron (recordDailyTaskCompletions) learned this
// lesson already: it computes "who qualifies" for its whole candidate set as ONE set-based SQL
// query, never a per-user loop, specifically to avoid the connection/resource pressure a
// per-user-round-trip pattern creates at scale. These two functions mirror that same shape (same
// WHERE-clause branches per task, same eligible/candidates CTE idea) — just combined with AND
// (every enabled task must independently clear its own threshold) rather than cmoon's OR (any one
// task's completion is enough), since "all tasks" is this feature's own, stricter definition of a
// qualifying day. dailyStreak.js's cron calls these for every batch of candidates instead of
// computeDailyTaskStatus in a per-user loop; computeDailyTaskStatus itself is untouched and still
// used for the single-user live endpoint.

/**
 * Batch version of the EVENING-pass check: for every id in `userIds`, returns whether their
 * evening-rooted tasks are all complete AND whether their morning-rooted tasks are all complete
 * (live semantics — Winwheel/Lotto uncapped, same as computeDailyTaskStatus's own default/no-
 * morningWindowEnd behavior), as one query per task instead of one query set per user.
 * Returns a Map<userId, { eveningComplete, morningComplete }>; a userId with no matching row in
 * the result (shouldn't happen — every id in `userIds` gets a row via the CTE) is treated by the
 * caller as "not complete" if looked up with a default.
 *
 * `config` is the caller's own `fetchTaskConfig(db)` result, fetched ONCE for the whole cron run
 * and passed in here — not re-fetched per batch. A cron processing more than CANDIDATE_BATCH_SIZE
 * candidates calls this once per batch; re-fetching config inside this function itself would let
 * an admin's mid-run edit apply to some batches but not others in the very same run.
 */
export async function computeBatchDailyTaskCompleteness(db, userIds, { dailyWindowStart, windowEnd, morningWindowStart, config }) {
  if (!userIds.length) return new Map()
  const { dailyPointLimit, tkoDailyPointLimit, czoneVisitMaxPerDay, winwheelMaxDailySpins, lottoCountPerDay } = config
  const ids = Prisma.join(userIds)
  const combatNames = Prisma.join(COMBAT_POOL_GAME_NAMES)

  const rows = await db.$queryRaw`
    WITH candidates AS (
      SELECT id FROM "User" WHERE id IN (${ids})
    ),
    login AS (
      SELECT "userId", COUNT(*)::int AS cnt FROM "PointsLog"
      WHERE "method" = 'Daily Login' AND "createdAt" >= ${dailyWindowStart} AND "createdAt" < ${windowEnd}
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    ),
    czone AS (
      SELECT "userId", COUNT(*)::int AS cnt FROM "PointsLog"
      WHERE "method" = 'cZone Visit' AND "createdAt" >= ${dailyWindowStart} AND "createdAt" < ${windowEnd}
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    ),
    gamepts AS (
      SELECT "userId", SUM("points")::int AS total FROM "GamePointLog"
      WHERE "createdAt" >= ${dailyWindowStart} AND "createdAt" < ${windowEnd}
        AND ("gameName" IS NULL OR "gameName" NOT IN (${combatNames}))
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    ),
    tkopts AS (
      SELECT "userId", SUM("points")::int AS total FROM "GamePointLog"
      WHERE "createdAt" >= ${dailyWindowStart} AND "createdAt" < ${windowEnd}
        AND "gameName" IN (${combatNames})
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    ),
    wheel AS (
      SELECT "userId", COUNT(*)::int AS cnt FROM "WheelSpinLog"
      WHERE "createdAt" >= ${morningWindowStart} AND ${VALID_SPIN_SQL}
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    ),
    lotto AS (
      SELECT "userId", "purchasesToday", "lastReset" FROM "LottoUser"
      WHERE "userId" IN (SELECT id FROM candidates)
    )
    SELECT
      c.id AS "userId",
      (COALESCE(login.cnt, 0) > 0) AS "dailyLoginComplete",
      (${czoneVisitMaxPerDay}::int <= 0 OR COALESCE(czone.cnt, 0) >= ${czoneVisitMaxPerDay}::int) AS "czoneVisitComplete",
      (${dailyPointLimit}::int <= 0 OR COALESCE(gamepts.total, 0) >= ${dailyPointLimit}::int) AS "gamePointsComplete",
      (${tkoDailyPointLimit}::int <= 0 OR COALESCE(tkopts.total, 0) >= ${tkoDailyPointLimit}::int) AS "tkoPointsComplete",
      (${winwheelMaxDailySpins}::int <= 0 OR COALESCE(wheel.cnt, 0) >= ${winwheelMaxDailySpins}::int) AS "winwheelComplete",
      (
        ${lottoCountPerDay}::int = -1 OR ${lottoCountPerDay}::int <= 0 OR
        (COALESCE(lotto."lastReset" >= ${morningWindowStart}, false) AND COALESCE(lotto."purchasesToday", 0) >= ${lottoCountPerDay}::int)
      ) AS "lottoComplete"
    FROM candidates c
    LEFT JOIN login ON login."userId" = c.id
    LEFT JOIN czone ON czone."userId" = c.id
    LEFT JOIN gamepts ON gamepts."userId" = c.id
    LEFT JOIN tkopts ON tkopts."userId" = c.id
    LEFT JOIN wheel ON wheel."userId" = c.id
    LEFT JOIN lotto ON lotto."userId" = c.id
  `

  const result = new Map()
  for (const r of rows) {
    const eveningComplete = !!r.dailyLoginComplete && !!r.czoneVisitComplete && !!r.gamePointsComplete && !!r.tkoPointsComplete
    const morningComplete = !!r.winwheelComplete && !!r.lottoComplete
    result.set(r.userId, { eveningComplete, morningComplete })
  }
  return result
}

/**
 * Batch version of the ~8am resolution pass's check: for every id in `pendingIds`, whether their
 * morning-rooted tasks are complete for the CLOSED window `[morningWindowStart, morningWindowEnd)`
 * — Lotto resolved from the immutable LottoLog, not the live counter, for the same reason
 * computeDailyTaskStatus's own `morningWindowEnd` branch is (see that function's own comment).
 * Returns a Map<userId, boolean>. `config` — see computeBatchDailyTaskCompleteness's own comment:
 * fetched once by the caller, never re-fetched per batch here.
 */
export async function computeBatchMorningCompleteness(db, userIds, { morningWindowStart, morningWindowEnd, config }) {
  if (!userIds.length) return new Map()
  const { winwheelMaxDailySpins, lottoCountPerDay } = config
  const ids = Prisma.join(userIds)

  const rows = await db.$queryRaw`
    WITH candidates AS (
      SELECT id FROM "User" WHERE id IN (${ids})
    ),
    wheel AS (
      SELECT "userId", COUNT(*)::int AS cnt FROM "WheelSpinLog"
      WHERE "createdAt" >= ${morningWindowStart} AND "createdAt" < ${morningWindowEnd}
        AND ${VALID_SPIN_SQL}
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    ),
    lotto AS (
      SELECT "userId", COUNT(*)::int AS cnt FROM "LottoLog"
      WHERE "createdAt" >= ${morningWindowStart} AND "createdAt" < ${morningWindowEnd}
        AND "userId" IN (SELECT id FROM candidates)
      GROUP BY "userId"
    )
    SELECT
      c.id AS "userId",
      (
        (${winwheelMaxDailySpins}::int <= 0 OR COALESCE(wheel.cnt, 0) >= ${winwheelMaxDailySpins}::int)
        AND
        (${lottoCountPerDay}::int = -1 OR ${lottoCountPerDay}::int <= 0 OR COALESCE(lotto.cnt, 0) >= ${lottoCountPerDay}::int)
      ) AS "morningComplete"
    FROM candidates c
    LEFT JOIN wheel ON wheel."userId" = c.id
    LEFT JOIN lotto ON lotto."userId" = c.id
  `

  return new Map(rows.map(r => [r.userId, !!r.morningComplete]))
}

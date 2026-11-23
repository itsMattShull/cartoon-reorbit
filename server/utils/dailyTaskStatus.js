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
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from './dailyTaskWindows.js'
import { COMBAT_POOL_GAME_NAMES } from './gamePoints.js'

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
 * winwheel/lotto queries: their own window is rooted at the 8am boundary and runs until the NEXT
 * 8am, which — unlike the 8pm-rooted tasks — has NOT yet closed at the 8pm instant the streak
 * cron evaluates, so capping them the same way would wrongly exclude same-day activity that still
 * legitimately counts.
 */
export async function computeDailyTaskStatus(db, userId, { asOf = new Date(), windowEnd = null } = {}) {
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
    db.gameConfig.findUnique({
      where: { gameName: 'Winwheel' },
      select: { maxDailySpins: true }
    }),
    db.lottoSettings.findUnique({
      where: { id: 'lotto' },
      select: { countPerDay: true }
    })
  ])

  const dailyWindowStart = getChicagoDailyBoundary(asOf)
  const morningWindowStart = getChicagoMorningWindowStart(asOf)
  const eveningCreatedAt = windowEnd ? { gte: dailyWindowStart, lt: windowEnd } : { gte: dailyWindowStart }

  const [
    dailyLoginCount,
    czoneVisitCount,
    gamePointAgg,
    tkoPointAgg,
    winwheelSpins,
    lottoUser
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
      where: { userId, createdAt: { gte: morningWindowStart }, status: { not: 'failed' }, result: { not: 'tripleNothing' } }
    }),
    db.lottoUser.findUnique({
      where: { userId },
      select: { purchasesToday: true, lastReset: true }
    })
  ])

  const dailyLoginPoints = Number(globalConfig?.dailyLoginPoints ?? 500)
  const dailyPointLimit = Number(globalConfig?.dailyPointLimit ?? 250)
  const tkoDailyPointLimit = Number(globalConfig?.tkoDailyPointLimit ?? 250)
  const czoneVisitMaxPerDay = Number(globalConfig?.czoneVisitMaxPerDay ?? 10)
  const czoneVisitPoints = Number(globalConfig?.czoneVisitPoints ?? 20)
  const winwheelMaxDailySpins = Number(winwheelConfig?.maxDailySpins ?? 0)
  const lottoCountPerDay = Number(lottoSettings?.countPerDay ?? 0)

  const gamePointsUsed = Number(gamePointAgg?._sum?.points || 0)
  const tkoPointsUsed = Number(tkoPointAgg?._sum?.points || 0)

  const lastResetAt = lottoUser?.lastReset ? new Date(lottoUser.lastReset) : null
  const lottoPurchasesToday = (lastResetAt && lastResetAt.getTime() >= morningWindowStart.getTime())
    ? Number(lottoUser?.purchasesToday || 0)
    : 0

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
// for allTasksComplete below) when its own admin-configured limit is > 0, mirroring the exact
// skip rule daily.get.js's own status booleans already encode (a `false` from an always-0 limit
// means "not applicable", not "incomplete").
const TASK_ENABLED_BY = Object.freeze({
  czoneVisitComplete: (config) => config.czoneVisitMaxPerDay > 0,
  gamePointsComplete: (config) => config.dailyPointLimit > 0,
  tkoPointsComplete: (config) => config.tkoDailyPointLimit > 0,
  winwheelComplete: (config) => config.winwheelMaxDailySpins > 0,
  lottoComplete: (config) => config.lottoCountPerDay !== -1 && config.lottoCountPerDay > 0
})

/** True iff every ENABLED task (dailyLoginComplete always counts; the rest only when their own
 * admin-configured limit is > 0) is complete. An admin with every optional task disabled still
 * requires at least daily login. */
export function allEnabledDailyTasksComplete({ status, config }) {
  if (!status.dailyLoginComplete) return false
  for (const [key, isEnabled] of Object.entries(TASK_ENABLED_BY)) {
    if (isEnabled(config) && !status[key]) return false
  }
  return true
}

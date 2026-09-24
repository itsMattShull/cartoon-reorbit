// server/utils/dailyTaskWindows.js
// Shared boundary math for the "daily task" checklist, extracted verbatim from
// server/api/onboarding/daily.get.js so that endpoint and the cMoon daily-task-completion
// cron (server/utils/cmoon.js) can never silently drift apart on what "today" means for a
// given task. Two different reset times are used for different tasks — this mismatch
// pre-dates this file and is not something introduced here:
//  - 8pm America/Chicago: daily login, cZone visits, general/combat game points
//  - 8am America/Chicago: Winwheel spins, Lotto purchases, monster barcode scans
import { DateTime } from 'luxon'

// `asOf` (default: now) lets a caller ask "what was the applicable boundary at this past
// instant" instead of always the current one — used by the daily-task backfill tool
// (server/api/admin/cmoons/backfill-daily-tasks.post.js) to re-run this same detection logic for
// a day the live cron missed, without duplicating its boundary math.
export function getChicagoDailyBoundary(asOf = new Date()) {
  const chicagoNow = DateTime.fromJSDate(asOf).setZone('America/Chicago')
  let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) boundaryLocal = boundaryLocal.minus({ days: 1 })
  return boundaryLocal.toUTC().toJSDate()
}

// Midnight of the current America/Chicago calendar day — used by runDailyCMoonScoring
// (server/utils/cmoon.js) as CMoonScoreLog.weekStart, deliberately NOT getChicagoDailyBoundary
// above. That function is pinned to a hardcoded 8pm boundary for the DAILY_TASK reset clock
// specifically (shared with daily.get.js) and has nothing to do with when the once-daily
// HIGH_SCORE/TOP10 job itself runs, which is admin-configurable (GlobalGameConfig.
// cMoonScoringRunHour/Minute). The two coincided as long as that run time defaulted to 8pm, but
// the moment an admin configures any other run time, getChicagoDailyBoundary() called BEFORE
// 8pm resolves to YESTERDAY's date — colliding with whatever weekStart yesterday's run (fired at
// the old, or any earlier, time) already used, and silently discarding today's award for anyone
// who also qualified yesterday (via the CMoonScoreLog unique constraint's skipDuplicates). A
// Chicago-midnight boundary advances exactly once per calendar day regardless of what hour the
// job actually executes at, so it never collides with a prior day's value no matter when the
// run time is configured.
export function getChicagoCalendarDayStart() {
  return DateTime.now().setZone('America/Chicago').startOf('day').toUTC().toJSDate()
}

// `asOf` — see getChicagoDailyBoundary's own comment above.
export function getChicagoMorningWindowStart(asOf = new Date()) {
  // Previously computed via now.toLocaleString(...) round-tripped back through `new Date(...)`,
  // which loses now's millisecond component and leaks it into the computed offset — the returned
  // instant jittered by up to ~1s between calls instead of landing on a stable, repeatable 08:00
  // Chicago boundary. Harmless while this value was only ever used as a WHERE >= filter threshold,
  // but server/utils/cmoon.js's recordDailyTaskCompletions now also uses it as a completion row's
  // dedup key (UserDailyTaskCompletion's unique (userId, date) constraint) — there, jitter would
  // defeat ON CONFLICT DO NOTHING and re-award the same morning-window completion on every tick.
  // Luxon's .set(...) mirrors getChicagoDailyBoundary above and is stable across calls.
  const chicagoNow = DateTime.fromJSDate(asOf).setZone('America/Chicago')
  let boundaryLocal = chicagoNow.set({ hour: 8, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) boundaryLocal = boundaryLocal.minus({ days: 1 })
  return boundaryLocal.toUTC().toJSDate()
}

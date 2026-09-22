// server/utils/dailyTaskWindows.js
// Shared boundary math for the "daily task" checklist, extracted verbatim from
// server/api/onboarding/daily.get.js so that endpoint and the cMoon daily-task-completion
// cron (server/utils/cmoon.js) can never silently drift apart on what "today" means for a
// given task. Two different reset times are used for different tasks — this mismatch
// pre-dates this file and is not something introduced here:
//  - 8pm America/Chicago: daily login, cZone visits, general/combat game points
//  - 8am America/Chicago: Winwheel spins, Lotto purchases, monster barcode scans
import { DateTime } from 'luxon'

export function getChicagoDailyBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) boundaryLocal = boundaryLocal.minus({ days: 1 })
  return boundaryLocal.toUTC().toJSDate()
}

export function getChicagoMorningWindowStart() {
  // Previously computed via now.toLocaleString(...) round-tripped back through `new Date(...)`,
  // which loses now's millisecond component and leaks it into the computed offset — the returned
  // instant jittered by up to ~1s between calls instead of landing on a stable, repeatable 08:00
  // Chicago boundary. Harmless while this value was only ever used as a WHERE >= filter threshold,
  // but server/utils/cmoon.js's recordDailyTaskCompletions now also uses it as a completion row's
  // dedup key (UserDailyTaskCompletion's unique (userId, date) constraint) — there, jitter would
  // defeat ON CONFLICT DO NOTHING and re-award the same morning-window completion on every tick.
  // Luxon's .set(...) mirrors getChicagoDailyBoundary above and is stable across calls.
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let boundaryLocal = chicagoNow.set({ hour: 8, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) boundaryLocal = boundaryLocal.minus({ days: 1 })
  return boundaryLocal.toUTC().toJSDate()
}

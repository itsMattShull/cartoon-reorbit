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
  const now = new Date()
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = now.getTime() - chicagoNow.getTime()
  const y = chicagoNow.getFullYear()
  const m = chicagoNow.getMonth()
  const d = chicagoNow.getDate()
  let resetUtcMs = new Date(y, m, d, 8, 0, 0).getTime() + offsetMs
  if (now.getTime() < resetUtcMs) resetUtcMs -= 24 * 60 * 60 * 1000
  return new Date(resetUtcMs)
}

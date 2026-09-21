// server/utils/packDailyWindow.js
// Shared by server/api/cmart/packs/buy.post.js and the admin "Reset Pack
// Limit" endpoint so both agree on exactly what "today" means for
// Pack.dailyPurchaseLimit.

/**
 * Returns the start of the current 8pm–7:59pm CST daily window as a UTC Date.
 * If it's before 8pm Chicago time, the window started yesterday at 8pm.
 */
export function getPackDailyWindowStart() {
  const now = new Date()

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )

  let year = +parts.year, month = +parts.month - 1, day = +parts.day
  const hour = +parts.hour

  if (hour < 20) {
    // Before 8pm Chicago — window started yesterday at 8pm
    const d = new Date(Date.UTC(year, month, day))
    d.setUTCDate(d.getUTCDate() - 1)
    year  = d.getUTCFullYear()
    month = d.getUTCMonth()
    day   = d.getUTCDate()
  }

  // Convert "YYYY-MM-DD 20:00 Chicago" → UTC using the same offset-correction
  // trick used elsewhere in this codebase.
  const utcGuessMs = Date.UTC(year, month, day, 20, 0, 0)
  const fmtCheck = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const displayed = Object.fromEntries(
    fmtCheck.formatToParts(new Date(utcGuessMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(
    +displayed.year, +displayed.month - 1, +displayed.day,
    +displayed.hour, +displayed.minute, +displayed.second
  )
  const offsetMs = zonalMs - utcGuessMs
  return new Date(utcGuessMs - offsetMs)
}

/**
 * An admin "Reset Pack Limit" moves the effective window start forward to the
 * reset time, so purchases made earlier in today's window stop counting
 * against the limit — without altering the UserPack rows those purchases
 * created. Falls back to the natural window start when there's no reset, or
 * the reset predates it (an old reset from a prior day should never keep
 * suppressing today's real purchases).
 *
 * @param {Date} windowStart
 * @param {Date|null|undefined} resetAt
 * @returns {Date}
 */
export function resolveEffectiveWindowStart(windowStart, resetAt) {
  if (resetAt && resetAt.getTime() > windowStart.getTime()) return resetAt
  return windowStart
}

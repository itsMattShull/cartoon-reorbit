// server/utils/centralTime.js
// Shared America/Chicago (CST/CDT) time helpers used by admin-scheduled
// features (Sales, packs, Winball schedule) to convert "wall clock in
// Chicago" values to/from UTC without a timezone library.

export function parseLocalYmdHm(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

export function centralLocalToUTC(localYmdHm) {
  const parts = parseLocalYmdHm(localYmdHm)
  if (!parts) return null

  const { y, m, d, h, mi } = parts
  const utcGuessMs = Date.UTC(y, m - 1, d, h, mi, 0)

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const displayed = Object.fromEntries(
    fmt.formatToParts(new Date(utcGuessMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(
    Number(displayed.year),
    Number(displayed.month) - 1,
    Number(displayed.day),
    Number(displayed.hour),
    Number(displayed.minute),
    Number(displayed.second)
  )

  const offsetMs = zonalMs - utcGuessMs
  return new Date(utcGuessMs - offsetMs)
}

/**
 * Returns the start of the current 8pm–7:59pm CST daily window as a UTC Date.
 * If it's before 8pm Chicago time, the window started yesterday at 8pm.
 */
export function getDailyWindowStart(now = new Date()) {
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
    const d = new Date(Date.UTC(year, month, day))
    d.setUTCDate(d.getUTCDate() - 1)
    year  = d.getUTCFullYear()
    month = d.getUTCMonth()
    day   = d.getUTCDate()
  }

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
    Number(displayed.year),
    Number(displayed.month) - 1,
    Number(displayed.day),
    Number(displayed.hour),
    Number(displayed.minute),
    Number(displayed.second)
  )
  const offsetMs = zonalMs - utcGuessMs
  return new Date(utcGuessMs - offsetMs)
}

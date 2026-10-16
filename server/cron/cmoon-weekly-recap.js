// server/cron/cmoon-weekly-recap.js
// Weekly cMoon top-slayer recap. Called every minute from the main cron runner (see
// server/cron/jobHandlers.js), same day/hour/minute + idempotency-stamp shape as
// cmoon-riddle-rotation.js's checkAndPostWeeklyRiddle — intentionally not sharing code with that
// file (the date-parts helper below is duplicated, not imported), same stance that file's own
// header comment takes on cmoon-riddle-rotation vs. create-weekly-czone-contest.
import { prisma } from '../prisma.js'
import { postWeeklyTopSlayerRecap } from '../utils/cmoonDiscordEvents.js'

function getChicagoDateParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric',
      weekday: 'short', hour12: false,
    }).formatToParts(date).map(p => [p.type, p.value])
  )
  const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    dayOfWeek: DOW_MAP[parts.weekday] ?? -1,
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    dateStr: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
  }
}

export async function checkAndPostWeeklyCMoonRecap() {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    if (!config?.cMoonWeeklyRecapEnabled) return

    const now = new Date()
    const { dayOfWeek, hour, minute, dateStr } = getChicagoDateParts(now)

    if (dayOfWeek !== config.cMoonWeeklyRecapDayOfWeek) return
    if (hour !== config.cMoonWeeklyRecapHour) return
    if (minute !== config.cMoonWeeklyRecapMinute) return
    if (config.cMoonWeeklyRecapLastPostedFor === dateStr) return

    await postWeeklyTopSlayerRecap()
    await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { cMoonWeeklyRecapLastPostedFor: dateStr } })
    console.log(`[cmoon-weekly-recap] Posted weekly top-slayer recap (${dateStr})`)
  } catch (err) {
    console.error('[cmoon-weekly-recap] Error posting weekly recap:', err.message)
  }
}

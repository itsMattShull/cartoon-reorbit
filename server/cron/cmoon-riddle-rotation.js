// server/cron/cmoon-riddle-rotation.js
// Weekly cMoon riddle auto-posting. Called every minute from the main cron runner (see
// server/cron/sync-guild-members.js), same shape as checkAndCreateWeeklyCZoneContest in
// create-weekly-czone-contest.js — intentionally not sharing code with that file (the date-parts
// helper below is duplicated, not imported) so this feature and the already-shipped weekly
// contest stay fully decoupled from each other.
import { prisma } from '../prisma.js'
import { broadcastToAllCMoonChannels } from '../utils/cmoonRiddle.js'

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

// The actual posting work, separated from the schedule check below so an admin's "Post next
// riddle now" button (server/api/admin/cmoon-riddles/post-next.post.js) can trigger the exact
// same behavior on demand, bypassing the day/hour/minute gate.
//
// Picks the oldest unposted active WEEKLY riddle (FIFO — whichever an admin authored first goes
// out first), deactivates whatever WEEKLY riddle was open before it (solved or not — each week is
// a fresh challenge, see CMoonRiddle's own schema comment), broadcasts the question to every
// cMoon's own Discord channel (deduped by resolved channel id, so cMoons sharing the
// GlobalGameConfig fallback channel only see it once, not once per cMoon), and marks it posted.
// Returns { posted: false } if there was nothing unposted to send.
export async function postNextWeeklyRiddle() {
  const next = await prisma.cMoonRiddle.findFirst({
    where: { kind: 'WEEKLY', active: true, postedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (!next) return { posted: false }

  await prisma.cMoonRiddle.updateMany({
    where: { kind: 'WEEKLY', active: true, postedAt: { not: null }, id: { not: next.id } },
    data: { active: false },
  })

  const message = `🧩 **This week's cMoon riddle!**\n${next.question}\n\nAnswer with \`/riddle\` — first team to solve it earns points!`
  await broadcastToAllCMoonChannels(prisma, message)

  await prisma.cMoonRiddle.update({ where: { id: next.id }, data: { postedAt: new Date() } })
  return { posted: true, riddleId: next.id }
}

export async function checkAndPostWeeklyRiddle() {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    if (!config?.cMoonRiddleRotationEnabled) return

    const now = new Date()
    const { dayOfWeek, hour, minute, dateStr } = getChicagoDateParts(now)

    if (dayOfWeek !== config.cMoonRiddleRotationDayOfWeek) return
    if (hour !== config.cMoonRiddleRotationHour) return
    if (minute !== config.cMoonRiddleRotationMinute) return
    if (config.cMoonRiddleLastPostedFor === dateStr) return

    const result = await postNextWeeklyRiddle()
    await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { cMoonRiddleLastPostedFor: dateStr } })

    if (result.posted) {
      console.log(`[cmoon-riddle-rotation] Posted riddle ${result.riddleId} (${dateStr})`)
    } else {
      console.warn(`[cmoon-riddle-rotation] No unposted weekly riddle available to post (${dateStr})`)
    }
  } catch (err) {
    console.error('[cmoon-riddle-rotation] Error posting weekly riddle:', err.message)
  }
}

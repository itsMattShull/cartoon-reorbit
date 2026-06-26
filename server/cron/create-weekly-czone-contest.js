// Weekly cZone contest auto-creation. Called every minute from the main cron runner.
import { prisma } from '../prisma.js'

function getCSTDateParts(date) {
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

function computeContestDate(startDate, startDow, toDow, toHour, toMinute, startHour, startMinute) {
  const days = ((toDow - startDow + 7) % 7) || 7
  const totalMinutes = days * 24 * 60 + (toHour - startHour) * 60 + (toMinute - startMinute)
  return new Date(startDate.getTime() + totalMinutes * 60 * 1000)
}

function renderTitle(template, startDate) {
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(startDate)
  return template.replace('{startDate}', dateStr)
}

export async function checkAndCreateWeeklyCZoneContest() {
  try {
    const config = await prisma.cZoneContestAutomationConfig.findUnique({ where: { id: 'singleton' } })
    if (!config?.enabled) return

    const now = new Date()
    const { dayOfWeek, hour, minute, dateStr } = getCSTDateParts(now)

    if (dayOfWeek !== config.startDayOfWeek) return
    if (hour !== config.startHour) return
    if (minute !== config.startMinute) return

    // Idempotency: skip if we already created a contest for this week's start date
    if (config.lastCreatedFor === dateStr) return

    const startDate = now
    const endDate = computeContestDate(
      startDate,
      config.startDayOfWeek, config.submissionEndDayOfWeek,
      config.submissionEndHour, config.submissionEndMinute,
      config.startHour, config.startMinute
    )
    const endVotingDate = computeContestDate(
      startDate,
      config.startDayOfWeek, config.votingEndDayOfWeek,
      config.votingEndHour, config.votingEndMinute,
      config.startHour, config.startMinute
    )

    const name = renderTitle(config.titleTemplate, startDate)

    await prisma.$transaction([
      prisma.cZoneContest.create({
        data: {
          name,
          startDate,
          endDate,
          endVotingDate,
          maxVotesPerUser: config.maxVotesPerUser,
          winnerPrizes:      { ctoons: [], backgroundIds: [], points: config.winnerPoints },
          participantPrizes: { ctoons: [], backgroundIds: [], points: config.participantPoints },
        },
      }),
      prisma.cZoneContestAutomationConfig.update({
        where: { id: 'singleton' },
        data: { lastCreatedFor: dateStr },
      }),
    ])

    console.log(`[cZone auto-contest] Created "${name}" (${dateStr})`)
  } catch (err) {
    console.error('[cZone auto-contest] Error creating weekly contest:', err.message)
  }
}

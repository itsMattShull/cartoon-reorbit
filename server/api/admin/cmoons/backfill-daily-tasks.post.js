// server/api/admin/cmoons/backfill-daily-tasks.post.js
// Catches up on DAILY_TASK completions the live per-minute cron
// (server/cron/record-daily-task-completions.js) missed while it wasn't running — e.g. during an
// outage like the one cMoonDailyTaskCronClaimedAt's lease-based lock now recovers from on its
// own. Re-running the live cron once it's healthy again only catches up completions under the
// CURRENT 8pm/8am boundaries; anyone who qualified under an EARLIER boundary that has since
// rolled over is otherwise lost for good, since recordDailyTaskCompletions always computes "the
// boundary as of right now" unless told otherwise.
//
// Reuses recordDailyTaskCompletions itself (with explicit past boundaries, `writeHeartbeat:
// false`) rather than re-implementing its detection SQL, so this can never drift out of sync
// with what the live cron actually checks. Every write it makes is exactly as idempotent as a
// normal live tick (UserDailyTaskCompletion's unique (userId, date), CMoonScoreLog's unique award
// constraint) — safe to run for a day that was already partly or fully recorded live; it only
// ever fills in genuine gaps, never double-awards. Synchronous (no queue/worker): each day is one
// set-based SQL sweep, not a per-member loop, so even a generous lookback is fast.
import { defineEventHandler, readBody, createError } from 'h3'
import { recordDailyTaskCompletions } from '@/server/utils/cmoon'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from '@/server/utils/dailyTaskWindows'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { prisma } from '@/server/prisma'

const DAYS_MIN = 1
const DAYS_MAX = 14
const DAYS_DEFAULT = 3
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event).catch(() => ({}))
  const daysRaw = body?.days
  const days = daysRaw === undefined ? DAYS_DEFAULT : Number(daysRaw)
  if (!Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
    throw createError({ statusCode: 400, statusMessage: `Days must be a whole number between ${DAYS_MIN} and ${DAYS_MAX}` })
  }

  const now = Date.now()
  const results = []
  let recorded = 0

  // One pass per calendar day back from today, oldest first — each `asOf` shifted by a full 24h
  // multiple lands on a distinct prior day's 8pm/8am boundary pair (the boundary hour is a fixed
  // wall-clock time, so shifting the reference instant by exactly 24h shifts "the most recent
  // boundary at-or-before it" by exactly one day too). Sequential, not parallel: every pass shares
  // the same CMoonScoreLog unique-constraint idempotency guard, and there's no benefit to
  // racing set-based SQL sweeps against each other.
  for (let i = days - 1; i >= 0; i--) {
    const asOf = new Date(now - i * ONE_DAY_MS)
    const dailyBoundary = getChicagoDailyBoundary(asOf)
    const morningBoundary = getChicagoMorningWindowStart(asOf)
    const { recorded: dayRecorded } = await recordDailyTaskCompletions({
      dailyBoundary, morningBoundary, writeHeartbeat: false,
    })
    recorded += dayRecorded
    results.push({ dailyBoundary, morningBoundary, recorded: dayRecorded })
  }

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:CMoons',
    key: 'backfillDailyTasks',
    prevValue: { days },
    newValue: { days, recorded },
  })

  return { days, recorded, results }
})

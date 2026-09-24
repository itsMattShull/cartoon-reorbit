// server/api/admin/cmoons/backfill-daily-tasks.post.js
// Catches up on DAILY_TASK completions the live daily-task cron
// (server/cron/record-daily-task-completions.js) missed while it wasn't running — e.g. during an
// outage like the one cMoonDailyTaskCronClaimedAt's lease-based lock now recovers from on its
// own. Re-running the live cron once it's healthy again only catches up completions under the
// CURRENT boundary; anyone who qualified under an EARLIER boundary that has since rolled over is
// otherwise lost for good, since recordDailyTaskCompletions always computes "the boundary as of
// right now" unless told otherwise.
//
// Reuses recordDailyTaskCompletions itself (with explicit past boundaries, `writeHeartbeat:
// false`) rather than re-implementing its detection SQL, so this can never drift out of sync
// with what the live cron actually checks — including that function's own upper-bounding of
// every append-only-log branch to exactly the one day being checked, and its exclusion of the
// two tasks (lotto, monster scans) that live entirely in current-state columns with no history to
// reconstruct from. This tool CANNOT backfill those two specifically — see cmoon.js's own
// comment on why — an admin who knows an outage spanned a boundary rollover should treat lotto/
// scans completions from that window as genuinely lost, not recoverable after the fact.
//
// Known limitation shared with the live cron itself, just more likely to matter over several
// days: a backfilled award is attributed using the member's CURRENT team/eligibility, not
// whatever it was on the day being backfilled (there's no membership-history table to look up
// otherwise) — only relevant for someone who switched teams (or joined/left) between the missed
// day and whenever this is run, so backfilling promptly after a known outage narrows that gap.
//
// Every write is exactly as idempotent as a normal live tick, so this is safe to run for a day
// that was already partly or fully recorded live — it only ever fills in genuine gaps, never
// double-awards. Synchronous (no queue/worker): each day is one set-based SQL sweep, not a
// per-member loop, so even a generous lookback is fast. The heavier, whole-table recomputes
// (recomputeCMoonTeamScores, recomputeCMoonPointsForUsers) are deferred out of
// recordDailyTaskCompletions's own per-day call (skipRecompute: true) and run at most ONCE for
// the whole request afterward — with `days` days each potentially awarding, paying that cost once
// per day here would be pure waste that only gets worse as CMoonScoreLog grows with the user base.
import { defineEventHandler, readBody, createError } from 'h3'
import { DateTime } from 'luxon'
import { recordDailyTaskCompletions, recomputeCMoonTeamScores } from '@/server/utils/cmoon'
import { recomputeCMoonPointsForUsers } from '@/server/cron/cmoon-points-aggregate'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from '@/server/utils/dailyTaskWindows'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { prisma } from '@/server/prisma'

const DAYS_MIN = 1
const DAYS_MAX = 14
const DAYS_DEFAULT = 3

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const daysRaw = body?.days
  const days = daysRaw === undefined ? DAYS_DEFAULT : Number(daysRaw)
  if (!Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
    throw createError({ statusCode: 400, statusMessage: `Days must be a whole number between ${DAYS_MIN} and ${DAYS_MAX}` })
  }

  const nowChicago = DateTime.now().setZone('America/Chicago')
  const results = []
  let recorded = 0
  const awardedUserIds = new Set()

  // One pass per calendar day back from today, oldest first. Stepped with Luxon's `.minus({
  // days: i })` in the Chicago zone specifically, NOT `now - i * 24*60*60*1000` — a plain
  // millisecond subtraction is wrong across a DST transition (skips or repeats a calendar day
  // depending on which way the clock shifted), while Luxon's calendar-aware subtraction always
  // lands on the correct wall-clock day regardless. Sequential, not parallel: every pass shares
  // the same CMoonScoreLog unique-constraint idempotency guard, and there's no benefit to racing
  // set-based SQL sweeps against each other.
  for (let i = days - 1; i >= 0; i--) {
    const asOf = nowChicago.minus({ days: i }).toJSDate()
    const dailyBoundary = getChicagoDailyBoundary(asOf)
    const morningBoundary = getChicagoMorningWindowStart(asOf)
    const { recorded: dayRecorded, awardedUserIds: dayAwardedUserIds } = await recordDailyTaskCompletions({
      dailyBoundary, morningBoundary, writeHeartbeat: false, skipRecompute: true,
    })
    recorded += dayRecorded
    for (const id of dayAwardedUserIds) awardedUserIds.add(id)
    results.push({ dailyBoundary, morningBoundary, recorded: dayRecorded })
  }

  if (awardedUserIds.size) {
    await recomputeCMoonTeamScores()
    await recomputeCMoonPointsForUsers([...awardedUserIds])
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

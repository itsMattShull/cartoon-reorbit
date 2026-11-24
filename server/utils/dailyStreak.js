// server/utils/dailyStreak.js
// Daily Streak: a player's day-over-day count of completing EVERY enabled daily task
// (server/utils/dailyTaskStatus.js), reset to 0 the first day any enabled task is missed, with
// admin-configured rewards (DailyStreakReward) at chosen streak-day milestones that optionally
// repeat once the highest configured day is passed (Admin > Manage Daily Streak).
//
// Two-phase evaluation, because the six daily tasks don't all reset on the same clock
// (dailyTaskWindows.js's own header comment): processDailyStreaks (~8pm) decides the four
// evening-rooted tasks immediately and, if they're all in, EITHER resolves the whole day right
// away (Winwheel/Lotto already done, or disabled) OR defers the verdict (User.
// dailyStreakPendingBoundary) when an enabled one of those two isn't done yet — their real
// deadline is 8am tomorrow, not tonight. resolvePendingDailyStreaks (~8:05am) finishes every
// deferred verdict once that window has genuinely closed.
//
// Relative imports only, NOT the `@/` alias: called from server/cron/process-daily-streaks.js, a
// plain `node` entrypoint that cannot resolve Nuxt/Vite's `@/` alias — same constraint
// notifications.js's own header comment explains, and the same reason achievements.js (reused
// here for grantRewardInTx) is itself already written this way.
import { prisma as db } from '../prisma.js'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from './dailyTaskWindows.js'
import { computeBatchDailyTaskCompleteness, computeBatchMorningCompleteness, fetchTaskConfig } from './dailyTaskStatus.js'
import { resolveDailyStreakEffectiveDay } from './dailyStreakCycle.js'
import { grantRewardInTx, enqueueCtoonJobs } from './achievements.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'

export { resolveDailyStreakEffectiveDay }

// Rows per batch when fetching candidate users — bounds memory for a very large active playerbase
// without needing a cursor; this cron runs once a day, so a little extra round-trip overhead here
// is immaterial next to the per-user work each candidate already does below.
const CANDIDATE_BATCH_SIZE = 2000

/**
 * Grants every DailyStreakReward row configured at `effectiveDay` to one user, atomically, then
 * enqueues any cToon mint jobs (the one necessarily-post-commit step this function itself must
 * do). `effectiveDay` null, or no rows configured for it, means "nothing to grant" — the counter
 * still advances, with no DailyStreakClaim row written (see that branch's own comment).
 * Returns `{ advanced, cmoonPointsGranted }` — `advanced` is false if a concurrent run already
 * claimed this exact streakDay first (see the DailyStreakClaim unique constraint); the caller
 * batches `recomputeCMoonPointsForUsers` itself across every user `cmoonPointsGranted` names,
 * rather than this function doing one recompute round trip per user (see processDailyStreaks'
 * own comment on why — the same batching recordDailyTaskCompletions/runDailyCMoonScoring already
 * do in server/utils/cmoon.js, for the same reason: this aggregate SQL scan is the one genuinely
 * expensive step in this whole per-user grant).
 */
async function advanceOneUserStreak({ userId, cMoonId, streakDay, effectiveDay, boundary }) {
  const rewardRows = effectiveDay == null
    ? []
    : await db.dailyStreakReward.findMany({
        where: { day: effectiveDay },
        include: {
          ctoon: { select: { quantity: true, name: true } }
        }
      })

  // Bundle CTOON/PACK/POINTS rows into the one flat object grantRewardInTx expects; CMOON_POINTS
  // rows grant through a separate CMoonScoreLog path below, since grantRewardInTx has no concept
  // of cMoon points at all (see its own header comment — cMoonPoints is a recomputed aggregate,
  // never incremented directly).
  const bundle = { points: 0, ctoons: [], packs: [] }
  const cmoonPointsRows = []
  for (const r of rewardRows) {
    const amount = Math.max(0, Number(r.amount || 0))
    if (r.rewardType === 'POINTS') {
      bundle.points += amount
    } else if (r.rewardType === 'CTOON' && r.ctoonId) {
      bundle.ctoons.push({ ctoonId: r.ctoonId, quantity: Math.max(1, amount || 1), ctoon: r.ctoon })
    } else if (r.rewardType === 'PACK' && r.packId) {
      bundle.packs.push({ packId: r.packId, quantity: Math.max(1, amount || 1) })
    } else if (r.rewardType === 'CMOON_POINTS') {
      cmoonPointsRows.push(r)
    }
  }
  // A player with no current cMoon simply can't earn a cMoon-points reward that day — every
  // OTHER reward row configured for the same day still grants normally (per product decision),
  // this just silently drops the cMoon-points portion rather than failing the whole day's grant.
  const grantCMoonPoints = cMoonId ? cmoonPointsRows : []

  // Nothing configured for this day at all (no rows, or effectiveDay was null) — just advance the
  // counter directly, with no DailyStreakClaim row. That row exists purely to make the ACTUAL
  // reward grant below idempotent against a concurrent duplicate attempt (its own doc comment);
  // with nothing to grant, there's nothing for it to protect, and inserting one anyway here would
  // leave one permanent, otherwise-unread row per active player per day, forever, for a feature
  // whose rewards are often configured on only a handful of milestone days. The counter bump
  // itself needs no such protection either way — writing the same idempotent (streakDay, boundary)
  // pair twice from two overlapping runs is harmless.
  if (rewardRows.length === 0) {
    await db.user.update({ where: { id: userId }, data: { dailyStreakCount: streakDay, dailyStreakLastBoundary: boundary, dailyStreakPendingBoundary: null } })
    return { advanced: true, cmoonPointsGranted: false }
  }

  let txResult
  try {
    txResult = await db.$transaction(async (tx) => {
      // Claimed FIRST, before any reward work: the unique (userId, streakDay) constraint is the
      // real idempotency backstop (belt-and-suspenders under the GlobalGameConfig cron lease,
      // which already should prevent two runs from ever reaching this point for the same
      // boundary) — failing fast here means a duplicate attempt never touches points/ctoons/
      // packs/cMoon points at all, and the whole transaction rolls back cleanly.
      await tx.dailyStreakClaim.create({ data: { userId, streakDay } })

      const granted = (bundle.points || bundle.ctoons.length || bundle.packs.length)
        ? await grantRewardInTx(tx, userId, bundle, 'DAILY_STREAK', 'DAILY_STREAK')
        : { ctoonJobs: [] }

      let cmoonPointsGranted = false
      for (const r of grantCMoonPoints) {
        const amount = Math.max(0, Number(r.amount || 0))
        if (amount <= 0) continue
        await tx.cMoonScoreLog.create({
          data: { cMoonId, userId, category: 'DAILY_STREAK', weekStart: boundary, detail: r.id, points: amount }
        })
        cmoonPointsGranted = true
      }

      await tx.user.update({
        where: { id: userId },
        data: { dailyStreakCount: streakDay, dailyStreakLastBoundary: boundary, dailyStreakPendingBoundary: null }
      })

      return { ...granted, cmoonPointsGranted }
    })
  } catch (err) {
    if (err?.code === 'P2002') return { advanced: false, cmoonPointsGranted: false } // already claimed this exact streak day - no-op
    throw err
  }

  if (txResult.ctoonJobs?.length) await enqueueCtoonJobs(userId, txResult.ctoonJobs, 'DAILY_STREAK')
  return { advanced: true, cmoonPointsGranted: txResult.cmoonPointsGranted }
}

/**
 * Once-daily rollup: for every user who could plausibly need it, decide whether they completed
 * every enabled EVENING-rooted daily task for the window that just closed (the Chicago 8pm
 * boundary just passed). A miss there is a definite reset — those tasks' own deadline already
 * passed. A player who cleared every evening task but still has an enabled Winwheel/Lotto task
 * outstanding is NOT reset yet: that task's real deadline is 8am tomorrow, not tonight, so the
 * verdict is deferred (User.dailyStreakPendingBoundary) for resolvePendingDailyStreaks (below) to
 * finish once that window has actually closed. Only once both groups are confirmed complete does
 * this advance the streak and grant whatever that day's effective milestone carries. Idempotent
 * per (user, boundary) via User.dailyStreakLastBoundary, and per (user, streakDay) via
 * DailyStreakClaim for the reward grant specifically — safe to re-run.
 */
export async function processDailyStreaks(asOf = new Date()) {
  // `boundary` is the 8pm boundary that JUST passed — the one this run is processing. The task
  // window being evaluated is the one that just closed: [previous boundary, boundary). Evaluating
  // with `asOf` set to an instant just before `boundary` (rather than `asOf` itself, which may be
  // well after it if this cron runs late) makes getChicagoDailyBoundary/getChicagoMorningWindowStart
  // resolve to that CLOSED window's own boundaries, not a brand-new one that only just opened.
  const boundary = getChicagoDailyBoundary(asOf)
  const justBeforeBoundary = new Date(boundary.getTime() - 1)
  const windowStart = getChicagoDailyBoundary(justBeforeBoundary)

  const [config, maxDayAgg, taskConfig] = await Promise.all([
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyStreakRepeatEnabled: true } }),
    db.dailyStreakReward.aggregate({ _max: { day: true } }),
    // Fetched ONCE for the whole run (not per batch) — see computeBatchDailyTaskCompleteness's
    // own comment on why a per-batch fetch would risk an admin's mid-run config edit applying to
    // some batches but not others in the same cron tick.
    fetchTaskConfig(db)
  ])
  const repeatEnabled = !!config?.dailyStreakRepeatEnabled
  const maxDay = maxDayAgg._max.day || 0

  // Candidates = anyone who could possibly extend a streak today (logged in during the window
  // that just closed — daily login has no admin off-switch, see allEnabledDailyTasksComplete's
  // own comment, so it's the one hard prerequisite every qualifying day must have) UNION anyone
  // with an existing streak who might need resetting (so a player who simply stops logging in
  // doesn't keep a stale positive streak forever). A user with neither is correctly skipped
  // entirely: streak 0 and no today's activity needs no write at all.
  const [loggedInRows, activeStreakRows] = await Promise.all([
    db.pointsLog.findMany({
      where: { method: 'Daily Login', createdAt: { gte: windowStart, lt: boundary } },
      select: { userId: true },
      distinct: ['userId']
    }),
    db.user.findMany({
      where: { dailyStreakCount: { gt: 0 } },
      select: { id: true }
    })
  ])
  const candidateIds = [...new Set([...loggedInRows.map(r => r.userId), ...activeStreakRows.map(r => r.id)])]

  let processed = 0
  let incremented = 0
  let reset = 0
  let deferred = 0
  const cmoonRecomputeUserIds = []

  for (let i = 0; i < candidateIds.length; i += CANDIDATE_BATCH_SIZE) {
    const batchIds = candidateIds.slice(i, i + CANDIDATE_BATCH_SIZE)
    const users = await db.user.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, cMoonId: true, dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true }
    })

    // Filter out anyone already settled for TONIGHT'S boundary (a prior run, or this run after a
    // retry) before even asking which tasks they've completed — same skip this batch used to do
    // per user, just ahead of the one shared query below instead of around thousands of separate
    // per-user ones.
    const toEvaluate = users.filter(u =>
      !(u.dailyStreakLastBoundary && u.dailyStreakLastBoundary.getTime() === boundary.getTime()) &&
      !(u.dailyStreakPendingBoundary && u.dailyStreakPendingBoundary.getTime() === boundary.getTime())
    )
    if (!toEvaluate.length) continue

    // ONE set-based query covering every user in this batch, mirroring server/utils/cmoon.js's
    // own daily-task cron (recordDailyTaskCompletions) — never a per-user round trip to decide
    // who qualifies. See computeBatchDailyTaskCompleteness's own header comment.
    const completeness = await computeBatchDailyTaskCompleteness(db, toEvaluate.map(u => u.id), {
      dailyWindowStart: windowStart, windowEnd: boundary, morningWindowStart: getChicagoMorningWindowStart(justBeforeBoundary), config: taskConfig
    })
    processed += toEvaluate.length

    const resetIds = []
    const deferIds = [] // normal defer: dailyStreakCount already holds the right value, untouched
    const staleDeferIds = [] // stale pending from an earlier, never-resolved night: reset to 0 too
    const advanceCandidates = []

    for (const user of toEvaluate) {
      // A pending flag for an OLDER boundary means resolvePendingDailyStreaks never got to finish
      // THAT day's verdict (its own lease/catch-up missed it entirely, well past its own recovery
      // window). There's no way to re-check a Winwheel/Lotto window that's long since rolled past,
      // and silently evaluating tonight fresh off the still-unadvanced counter would hand that
      // never-verified day a free pass. Treat it conservatively as a miss instead - exactly like
      // any other reset - before tonight's own evaluation proceeds from a clean 0.
      const isStalePending = !!user.dailyStreakPendingBoundary
      const priorStreakCount = isStalePending ? 0 : user.dailyStreakCount
      const { eveningComplete, morningComplete } = completeness.get(user.id) || { eveningComplete: false, morningComplete: false }

      if (!eveningComplete) {
        resetIds.push(user.id)
        continue
      }
      if (!morningComplete) {
        // Evening tasks are all in, but an enabled Winwheel/Lotto task isn't done yet and its
        // window doesn't close until 8am tomorrow - defer rather than resetting a player who
        // still has time left on the live checklist's own terms.
        ;(isStalePending ? staleDeferIds : deferIds).push(user.id)
        continue
      }
      advanceCandidates.push({ userId: user.id, cMoonId: user.cMoonId, priorStreakCount })
    }

    // Bulk writes for the reset/defer outcomes — these never need a transaction or per-user
    // branching (nothing is granted), so one UPDATE per outcome covers the whole batch instead of
    // one per user.
    if (resetIds.length) {
      await db.user.updateMany({ where: { id: { in: resetIds } }, data: { dailyStreakCount: 0, dailyStreakLastBoundary: boundary, dailyStreakPendingBoundary: null } })
      reset += resetIds.length
    }
    if (deferIds.length) {
      await db.user.updateMany({ where: { id: { in: deferIds } }, data: { dailyStreakPendingBoundary: boundary } })
      deferred += deferIds.length
    }
    if (staleDeferIds.length) {
      await db.user.updateMany({ where: { id: { in: staleDeferIds } }, data: { dailyStreakCount: 0, dailyStreakPendingBoundary: boundary } })
      deferred += staleDeferIds.length
    }

    // The reward grant itself is inherently per-user (different reward types, a mint-queue side
    // effect per cToon reward, the cMoon-points no-cMoon skip, DailyStreakClaim's own
    // idempotency) — unlike the classification above, there's no set-based equivalent for this
    // part, same as recordDailyTaskCompletions's own award step isn't a single UPDATE either.
    for (const { userId, cMoonId, priorStreakCount } of advanceCandidates) {
      const streakDay = priorStreakCount + 1
      const effectiveDay = resolveDailyStreakEffectiveDay(streakDay, maxDay, repeatEnabled)
      const { advanced, cmoonPointsGranted } = await advanceOneUserStreak({ userId, cMoonId, streakDay, effectiveDay, boundary })
      if (advanced) incremented++
      if (cmoonPointsGranted) cmoonRecomputeUserIds.push(userId)
    }
  }

  // One batched recompute for the whole run rather than one per user — the same batching
  // recordDailyTaskCompletions/runDailyCMoonScoring already do in server/utils/cmoon.js, since
  // this is a real SQL aggregate scan per call, not a free operation to repeat per user.
  if (cmoonRecomputeUserIds.length) await recomputeCMoonPointsForUsers(cmoonRecomputeUserIds)

  return { processed, incremented, reset, deferred, boundary }
}

/**
 * Follow-up pass (~8:05am Chicago, server/cron/resolve-pending-daily-streaks.js) that finishes
 * every verdict processDailyStreaks deferred last night: re-evaluates JUST the Winwheel/Lotto
 * portion for the morning window that has now genuinely closed, then advances or resets exactly
 * as processDailyStreaks itself would have — stamping the SAME evening boundary those deferred
 * users are still waiting on (not this morning boundary), so the streak reads as having been
 * decided for that evening either way.
 */
export async function resolvePendingDailyStreaks(asOf = new Date()) {
  // The morning boundary that JUST closed, and the evening boundary that fell inside the window
  // it closes (yesterday 8pm, the most recent evening boundary at-or-before an instant just
  // inside this now-closed window) — the exact evening boundary last night's processDailyStreaks
  // run would have deferred these users under.
  const morningBoundary = getChicagoMorningWindowStart(asOf)
  const justBeforeMorningBoundary = new Date(morningBoundary.getTime() - 1)
  const eveningBoundary = getChicagoDailyBoundary(justBeforeMorningBoundary)
  // The start of the now-closed window itself — the PREVIOUS morning boundary (one Chicago day
  // before `morningBoundary`), i.e. what getChicagoMorningWindowStart(justBeforeMorningBoundary)
  // resolves to, same as computeDailyTaskStatus's own internal computation from that same asOf.
  const morningWindowStart = getChicagoMorningWindowStart(justBeforeMorningBoundary)

  const [config, maxDayAgg, taskConfig] = await Promise.all([
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyStreakRepeatEnabled: true } }),
    db.dailyStreakReward.aggregate({ _max: { day: true } }),
    // Fetched ONCE for the whole run — see processDailyStreaks' own comment on why.
    fetchTaskConfig(db)
  ])
  const repeatEnabled = !!config?.dailyStreakRepeatEnabled
  const maxDay = maxDayAgg._max.day || 0

  const pendingIds = (await db.user.findMany({
    where: { dailyStreakPendingBoundary: eveningBoundary },
    select: { id: true }
  })).map(u => u.id)

  let processed = 0
  let incremented = 0
  let reset = 0
  const cmoonRecomputeUserIds = []

  // Same id-batching as processDailyStreaks' own candidate loop, for the same reason — this set
  // can grow as large as the active playerbase if Winwheel/Lotto completion habitually lags.
  for (let i = 0; i < pendingIds.length; i += CANDIDATE_BATCH_SIZE) {
    const batchIds = pendingIds.slice(i, i + CANDIDATE_BATCH_SIZE)
    const pendingUsers = await db.user.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, cMoonId: true, dailyStreakCount: true }
    })
    if (!pendingUsers.length) continue

    // ONE set-based query covering every pending user in this batch — same reasoning as
    // processDailyStreaks' own batch check (see computeBatchMorningCompleteness's header comment).
    const morningCompleteness = await computeBatchMorningCompleteness(db, pendingUsers.map(u => u.id), {
      morningWindowStart,
      morningWindowEnd: morningBoundary,
      config: taskConfig
    })
    processed += pendingUsers.length

    const resetIds = []
    const advanceCandidates = []
    for (const user of pendingUsers) {
      const morningComplete = morningCompleteness.get(user.id) ?? false
      if (!morningComplete) {
        resetIds.push(user.id)
        continue
      }
      advanceCandidates.push({ userId: user.id, cMoonId: user.cMoonId, priorStreakCount: user.dailyStreakCount })
    }

    if (resetIds.length) {
      await db.user.updateMany({ where: { id: { in: resetIds } }, data: { dailyStreakCount: 0, dailyStreakLastBoundary: eveningBoundary, dailyStreakPendingBoundary: null } })
      reset += resetIds.length
    }

    // The reward grant itself is inherently per-user — see processDailyStreaks' own comment on
    // why this part has no set-based equivalent.
    for (const { userId, cMoonId, priorStreakCount } of advanceCandidates) {
      const streakDay = priorStreakCount + 1
      const effectiveDay = resolveDailyStreakEffectiveDay(streakDay, maxDay, repeatEnabled)
      const { advanced, cmoonPointsGranted } = await advanceOneUserStreak({ userId, cMoonId, streakDay, effectiveDay, boundary: eveningBoundary })
      if (advanced) incremented++
      if (cmoonPointsGranted) cmoonRecomputeUserIds.push(userId)
    }
  }

  if (cmoonRecomputeUserIds.length) await recomputeCMoonPointsForUsers(cmoonRecomputeUserIds)

  return { processed, incremented, reset, eveningBoundary }
}

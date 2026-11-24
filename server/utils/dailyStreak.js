// server/utils/dailyStreak.js
// Daily Streak: a player's day-over-day count of completing EVERY enabled daily task
// (server/utils/dailyTaskStatus.js), reset to 0 the first day any enabled task is missed, with
// admin-configured rewards (DailyStreakReward) at chosen streak-day milestones that optionally
// repeat once the highest configured day is passed (Admin > Manage Daily Streak).
//
// Relative imports only, NOT the `@/` alias: called from server/cron/process-daily-streaks.js, a
// plain `node` entrypoint that cannot resolve Nuxt/Vite's `@/` alias — same constraint
// notifications.js's own header comment explains, and the same reason achievements.js (reused
// here for grantRewardInTx) is itself already written this way.
import { prisma as db } from '../prisma.js'
import { getChicagoDailyBoundary } from './dailyTaskWindows.js'
import { computeDailyTaskStatus, allEnabledDailyTasksComplete } from './dailyTaskStatus.js'
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
    await db.user.update({ where: { id: userId }, data: { dailyStreakCount: streakDay, dailyStreakLastBoundary: boundary } })
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
        data: { dailyStreakCount: streakDay, dailyStreakLastBoundary: boundary }
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
 * every enabled daily task for the window that just closed (the Chicago 8pm boundary just
 * passed) — if so, advance their streak and grant whatever that day's effective milestone
 * carries; if not, reset their streak to 0. Idempotent per (user, boundary) via
 * User.dailyStreakLastBoundary, and per (user, streakDay) via DailyStreakClaim for the reward
 * grant specifically — safe to re-run.
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

  const [config, maxDayAgg] = await Promise.all([
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyStreakRepeatEnabled: true } }),
    db.dailyStreakReward.aggregate({ _max: { day: true } })
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
  const cmoonRecomputeUserIds = []

  for (let i = 0; i < candidateIds.length; i += CANDIDATE_BATCH_SIZE) {
    const batchIds = candidateIds.slice(i, i + CANDIDATE_BATCH_SIZE)
    const users = await db.user.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, cMoonId: true, dailyStreakCount: true, dailyStreakLastBoundary: true }
    })

    for (const user of users) {
      // Already processed for this exact boundary (a prior run, or this run after a retry) -
      // skip without even recomputing task status.
      if (user.dailyStreakLastBoundary && user.dailyStreakLastBoundary.getTime() === boundary.getTime()) continue

      const { status, config: taskConfig } = await computeDailyTaskStatus(db, user.id, { asOf: justBeforeBoundary, windowEnd: boundary })
      const allComplete = allEnabledDailyTasksComplete({ status, config: taskConfig })
      processed++

      if (!allComplete) {
        await db.user.update({ where: { id: user.id }, data: { dailyStreakCount: 0, dailyStreakLastBoundary: boundary } })
        reset++
        continue
      }

      const streakDay = user.dailyStreakCount + 1
      const effectiveDay = resolveDailyStreakEffectiveDay(streakDay, maxDay, repeatEnabled)
      const { advanced, cmoonPointsGranted } = await advanceOneUserStreak({ userId: user.id, cMoonId: user.cMoonId, streakDay, effectiveDay, boundary })
      if (advanced) incremented++
      if (cmoonPointsGranted) cmoonRecomputeUserIds.push(user.id)
    }
  }

  // One batched recompute for the whole run rather than one per user — the same batching
  // recordDailyTaskCompletions/runDailyCMoonScoring already do in server/utils/cmoon.js, since
  // this is a real SQL aggregate scan per call, not a free operation to repeat per user.
  if (cmoonRecomputeUserIds.length) await recomputeCMoonPointsForUsers(cmoonRecomputeUserIds)

  return { processed, incremented, reset, boundary }
}

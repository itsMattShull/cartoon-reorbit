// server/workers/cmoon-daily-task-backfill.worker.js
// Admin one-time correction tool: grants a flat, admin-specified bonus to every current cMoon
// member, logged the same way any other award is (a CMoonScoreLog row), so it counts toward both
// the member's own rank progress (User.cMoonPoints, via recomputeCMoonPointsForUsers) and their
// team's score (CMoon.teamScore, via recomputeCMoonTeamScores) exactly like an organically-earned
// award would. Exists to catch up members who were blocked from ever earning a live DAILY_TASK
// award by a since-corrected admin config (e.g. cMoonScoringMinAccountAgeDays set far higher than
// intended) — see Admin > cMoons > "Backfill cMoon Points",
// server/api/admin/cmoons/backfill-points.post.js.
//
// `excludeAlreadyScored: true` (the default in the admin UI) skips any member whose
// User.cMoonPoints is already > 0, so a member who already organically earned this exact catch-up
// amount doesn't receive it a second time on top of what they earned themselves.
//
// Deliberately processes members ONE AT A TIME in a single job (not N parallel jobs), same
// progress-modal shape as server/workers/cmoon-rank-recalc.worker.js — see
// server/api/admin/cmoons/backfill-points-status.get.js.
//
// Idempotent per run: each CMoonScoreLog row is keyed to `job.id` (unique per admin-triggered run,
// see backfill-points.post.js) via the `detail` column, so a retried/resumed job can't double-award
// a member it already reached — the unique constraint (cMoonId, userId, category, weekStart,
// detail) makes a duplicate insert a no-op (caught and skipped) rather than an error. A genuinely
// NEW future run gets its own job.id, so it isn't blocked from awarding again — unlike
// cmoonRankRecalcQueue's tool, this one is meant to be run again for a fresh batch of members.
import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { logAdminChange } from '../utils/adminChangeLog.js'
import { recomputeCMoonTeamScores } from '../utils/cmoon.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'

const QUEUE_KEY = process.env.CMOON_DAILY_TASK_BACKFILL_QUEUE_KEY || 'cmoonDailyTaskBackfillQueue'
const BACKFILL_CATEGORY = 'ADMIN_BACKFILL'
const RECENT_LIMIT = 25

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const worker = new Worker(QUEUE_KEY, async (job) => {
  const { adminId, amount, excludeAlreadyScored } = job.data || {}
  // Stable across a retry/resume of this same job (BullMQ's own creation timestamp), unlike
  // `new Date()` re-evaluated on every attempt — see this file's header comment on idempotency.
  const weekStart = new Date(job.timestamp)

  const candidates = await prisma.user.findMany({
    where: {
      cMoonId: { not: null },
      ...(excludeAlreadyScored ? { cMoonPoints: { lte: 0 } } : {}),
    },
    select: { id: true, username: true, cMoonId: true, cMoonPoints: true, cMoon: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })

  const total = candidates.length
  let processed = 0
  let awarded = 0
  let skipped = 0
  const awardedUserIds = []
  const recent = []

  await job.updateProgress({ pct: 0, processed, total, recent })

  for (const user of candidates) {
    let didAward = false
    try {
      await prisma.cMoonScoreLog.create({
        data: {
          cMoonId: user.cMoonId,
          userId: user.id,
          category: BACKFILL_CATEGORY,
          detail: job.id,
          points: amount,
          weekStart,
        },
      })
      didAward = true
    } catch (err) {
      // P2002 = unique constraint hit — this exact (cMoonId, userId, category, weekStart, detail)
      // row already exists, meaning a prior attempt of this same job already awarded this member.
      // Anything else is a real failure and should surface as a job failure like normal.
      if (err?.code !== 'P2002') throw err
    }

    if (didAward) {
      awarded++
      awardedUserIds.push(user.id)
    } else {
      skipped++
    }

    processed++
    const entry = {
      username: user.username,
      cMoonName: user.cMoon?.name || null,
      points: amount,
      awarded: didAward,
    }
    recent.push(entry)
    if (recent.length > RECENT_LIMIT) recent.shift()

    await job.updateProgress({
      pct: total ? Math.round((processed / total) * 100) : 100,
      processed, total, recent, current: entry,
    })
  }

  // Batched once at the end, not per member — both are cheap set-based operations over however
  // many members were actually awarded, not a per-user round trip.
  if (awardedUserIds.length) {
    await recomputeCMoonPointsForUsers(awardedUserIds)
  }
  await recomputeCMoonTeamScores()

  const summary = { total, processed, awarded, skipped, amount }

  await logAdminChange(prisma, {
    userId: adminId,
    area: 'Admin:CMoons',
    key: 'backfillPoints',
    prevValue: { candidateCount: total, amount, excludeAlreadyScored: !!excludeAlreadyScored },
    newValue: summary,
  })

  return summary
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[cmoon-daily-task-backfill worker] Job ${job?.id} failed:`, err)
})

export default worker

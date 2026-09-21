// server/api/admin/cmoons/recalculate-points.post.js
// Enqueues the "Recalculate cMoon Points" one-time correction job (see
// server/workers/cmoon-rank-recalc.worker.js) — only enqueues, the actual per-member recompute
// runs in the worker so a large member base doesn't block this request or risk a half-applied
// run if it's interrupted. A single fixed jobId means a second click while one is already
// running just hands back the same job instead of starting an overlapping one.
import { defineEventHandler } from 'h3'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { cmoonRankRecalcQueue } from '@/server/utils/queues'

export const CMOON_RANK_RECALC_JOB_ID = 'cmoon-rank-recalc-all'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const existingJob = await cmoonRankRecalcQueue.getJob(CMOON_RANK_RECALC_JOB_ID)
  if (existingJob) {
    const state = await existingJob.getState()
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      return { jobId: existingJob.id, alreadyRunning: true }
    }
    // Stale completed/failed job — remove it so we can re-use the same jobId.
    try { await existingJob.remove() } catch {}
  }

  const job = await cmoonRankRecalcQueue.add(
    'recalculate',
    { adminId: me.id, adminUsername: me.username || me.id },
    { jobId: CMOON_RANK_RECALC_JOB_ID }
  )

  return { jobId: job.id }
})

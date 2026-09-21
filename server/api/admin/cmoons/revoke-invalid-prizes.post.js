// server/api/admin/cmoons/revoke-invalid-prizes.post.js
// Enqueues the "Revoke Invalid cMoon Rank Prizes" one-time correction job (see
// server/workers/cmoon-prize-revoke.worker.js) — only enqueues, the actual per-member work runs
// in the worker. A single fixed jobId means a second click while one is already running just
// hands back the same job instead of starting an overlapping one.
import { defineEventHandler } from 'h3'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { cmoonPrizeRevokeQueue } from '@/server/utils/queues'

export const CMOON_PRIZE_REVOKE_JOB_ID = 'cmoon-prize-revoke-all'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const existingJob = await cmoonPrizeRevokeQueue.getJob(CMOON_PRIZE_REVOKE_JOB_ID)
  if (existingJob) {
    const state = await existingJob.getState()
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      return { jobId: existingJob.id, alreadyRunning: true }
    }
    // Stale completed/failed job — remove it so we can re-use the same jobId.
    try { await existingJob.remove() } catch {}
  }

  const job = await cmoonPrizeRevokeQueue.add(
    'revoke',
    { adminId: me.id, adminUsername: me.username || me.id },
    { jobId: CMOON_PRIZE_REVOKE_JOB_ID }
  )

  return { jobId: job.id }
})

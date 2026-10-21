// server/api/admin/cmoons/hp-catch-up.post.js
// Enqueues the "HP Catch Up" one-time correction job (see
// server/workers/cmoon-hp-catchup.worker.js) — only enqueues, the actual per-cMoon/per-member work
// runs in the worker so a large member base doesn't block this request or risk a half-applied run
// if it's interrupted. A single fixed jobId means a second click while one is already running just
// hands back the same job instead of starting an overlapping one.
import { defineEventHandler } from 'h3'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { cmoonHpCatchUpQueue } from '@/server/utils/queues'

export const CMOON_HP_CATCHUP_JOB_ID = 'cmoon-hp-catchup-all'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const existingJob = await cmoonHpCatchUpQueue.getJob(CMOON_HP_CATCHUP_JOB_ID)
  if (existingJob) {
    const state = await existingJob.getState()
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      return { jobId: existingJob.id, alreadyRunning: true }
    }
    // Stale completed/failed job — remove it so we can re-use the same jobId.
    try { await existingJob.remove() } catch {}
  }

  const job = await cmoonHpCatchUpQueue.add(
    'hp-catch-up',
    { adminId: me.id, adminUsername: me.username || me.id },
    { jobId: CMOON_HP_CATCHUP_JOB_ID }
  )

  return { jobId: job.id }
})

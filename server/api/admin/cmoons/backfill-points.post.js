// server/api/admin/cmoons/backfill-points.post.js
// Enqueues the "Backfill cMoon Points" one-time correction job (see
// server/workers/cmoon-daily-task-backfill.worker.js) — only enqueues, the actual per-member grant
// runs in the worker so a large member base doesn't block this request.
//
// Unlike recalculate-points.post.js's single fixed jobId, this generates a fresh unique jobId per
// trigger: an admin may legitimately want to run this again later (a newly-joined batch of
// members, a different amount), and a stale reused jobId would block that rather than protect
// against it — see the worker's own header comment. A second click while one is already running
// is instead prevented by scanning the queue's own active/waiting/delayed jobs below.
import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { cmoonDailyTaskBackfillQueue } from '@/server/utils/queues'

const AMOUNT_MIN = 1
const AMOUNT_MAX = 100000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const amount = Number(body?.amount)
  if (!Number.isInteger(amount) || amount < AMOUNT_MIN || amount > AMOUNT_MAX) {
    throw createError({ statusCode: 400, statusMessage: `Amount must be a whole number between ${AMOUNT_MIN} and ${AMOUNT_MAX}` })
  }
  const excludeAlreadyScored = body?.excludeAlreadyScored !== false

  const inFlight = await cmoonDailyTaskBackfillQueue.getJobs(['active', 'waiting', 'delayed'])
  if (inFlight.length) {
    const existing = inFlight[0]
    return {
      jobId: existing.id,
      alreadyRunning: true,
      amount: existing.data?.amount,
      excludeAlreadyScored: !!existing.data?.excludeAlreadyScored,
    }
  }

  const job = await cmoonDailyTaskBackfillQueue.add(
    'backfill',
    { adminId: me.id, adminUsername: me.username || me.id, amount, excludeAlreadyScored },
    { jobId: `cmoon-daily-task-backfill-${Date.now()}` }
  )

  return { jobId: job.id, amount, excludeAlreadyScored }
})

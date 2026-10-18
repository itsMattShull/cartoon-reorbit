// server/workers/dissolve-misfire-resolve.worker.js
// Admin tool: processes a batch of DissolveMisfireLog ids one at a time, restoring each cToon to
// its original auction winner and compensating everyone else who held it since. See
// server/utils/dissolveMisfireRemediation.js for the actual algorithm — this worker only drives
// the queue/progress-modal plumbing, same shape as cmoon-daily-task-backfill.worker.js. Enqueued
// by server/api/admin/dissolve-misfires/resolve.post.js, polled by resolve-status.get.js.
import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { computeRemediationPlan, executeRemediationPlan } from '../utils/dissolveMisfireRemediation.js'

const QUEUE_KEY = process.env.DISSOLVE_MISFIRE_RESOLVE_QUEUE_KEY || 'dissolveMisfireResolveQueue'
const RECENT_LIMIT = 25

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const worker = new Worker(QUEUE_KEY, async (job) => {
  const { misfireIds = [], adminId, adminUsername } = job.data || {}

  const total = misfireIds.length
  let processed = 0
  let resolved = 0
  let alreadyCorrect = 0
  let blocked = 0
  let failed = 0
  const recent = []

  await job.updateProgress({ pct: 0, processed, total, recent })

  for (const misfireId of misfireIds) {
    let entry
    try {
      const plan = await computeRemediationPlan(misfireId)
      if (plan.blocked) {
        blocked++
        await prisma.dissolveMisfireLog.update({
          where: { id: misfireId },
          data: { resolutionBlockedReason: plan.blocked }
        })
        entry = { misfireId, status: 'blocked', reason: plan.blocked }
      } else if (plan.alreadyResolved) {
        entry = { misfireId, status: 'already_resolved' }
      } else if (plan.alreadyCorrect) {
        alreadyCorrect++
        await prisma.dissolveMisfireLog.update({
          where: { id: misfireId },
          data: {
            resolvedAt: new Date(),
            resolvedByUserId: adminId ?? null,
            resolvedByUsername: adminUsername ?? null,
            resolutionSummary: { alreadyCorrect: true }
          }
        })
        entry = { misfireId, status: 'already_correct' }
      } else {
        const summary = await executeRemediationPlan(plan, { adminId, adminUsername })
        resolved++
        entry = {
          misfireId,
          status: 'resolved',
          ctoonName: plan.ctoonName,
          mintNumber: plan.mintNumber,
          originalWinner: plan.originalWinner.username,
          totalCompensationPoints: summary.totalCompensationPoints
        }
      }
    } catch (err) {
      failed++
      entry = { misfireId, status: 'failed', reason: err?.message || String(err) }
    }

    processed++
    recent.push(entry)
    if (recent.length > RECENT_LIMIT) recent.shift()

    await job.updateProgress({
      pct: total ? Math.round((processed / total) * 100) : 100,
      processed, total, recent, current: entry,
    })
  }

  return { total, processed, resolved, alreadyCorrect, blocked, failed }
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[dissolve-misfire-resolve worker] Job ${job?.id} failed:`, err)
})

export default worker

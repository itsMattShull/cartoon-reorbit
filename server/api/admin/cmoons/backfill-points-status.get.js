// server/api/admin/cmoons/backfill-points-status.get.js
// Polled by the "Backfill cMoon Points" admin modal — mirrors recalculate-points-status.get.js's
// job.getState() + job.progress shape. Unlike that endpoint, `jobId` is OPTIONAL here: with no
// jobId (e.g. the modal was just reopened and doesn't know the last run's id) this scans the
// queue's own active/waiting/delayed jobs and reports whichever one it finds, so reopening the
// modal can resume showing progress without the frontend having remembered the id itself.
import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { cmoonDailyTaskBackfillQueue } from '@/server/utils/queues'

const IDLE = { status: 'idle', pct: 0, processed: 0, total: 0, recent: [], current: null }

function progressShape(job) {
  const raw = job.progress
  const p = (typeof raw === 'object' && raw !== null) ? raw : {}
  return {
    pct: p.pct ?? 0,
    processed: p.processed ?? 0,
    total: p.total ?? 0,
    recent: p.recent ?? [],
    current: p.current ?? null,
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { jobId } = getQuery(event)

  let job = null
  if (typeof jobId === 'string' && jobId) {
    job = await cmoonDailyTaskBackfillQueue.getJob(jobId)
    if (!job) return { status: 'not_found', ...IDLE }
  } else {
    const inFlight = await cmoonDailyTaskBackfillQueue.getJobs(['active', 'waiting', 'delayed'])
    job = inFlight[0] || null
    if (!job) return IDLE
  }

  const state = await job.getState()
  const base = progressShape(job)

  if (state === 'completed') {
    return { status: 'completed', jobId: job.id, ...base, pct: 100, processed: base.total, summary: job.returnvalue }
  }
  if (state === 'failed') {
    return { status: 'failed', jobId: job.id, ...base, error: job.failedReason || 'Unknown error' }
  }

  return { status: state, jobId: job.id, ...base }
})

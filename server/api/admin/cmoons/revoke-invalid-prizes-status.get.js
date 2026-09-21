// server/api/admin/cmoons/revoke-invalid-prizes-status.get.js
// Polled by the "Revoke Invalid cMoon Rank Prizes" admin modal — same job.getState() +
// job.progress shape as server/api/admin/cmoons/recalculate-points-status.get.js.
import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { cmoonPrizeRevokeQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { jobId } = getQuery(event)
  if (typeof jobId !== 'string' || !jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }

  const job = await cmoonPrizeRevokeQueue.getJob(jobId)
  if (!job) {
    return { status: 'not_found', pct: 0, processed: 0, total: 0, recent: [], current: null }
  }

  const state = await job.getState()
  const raw = job.progress
  const p = (typeof raw === 'object' && raw !== null) ? raw : {}
  const base = {
    pct: p.pct ?? 0,
    processed: p.processed ?? 0,
    total: p.total ?? 0,
    recent: p.recent ?? [],
    current: p.current ?? null,
  }

  if (state === 'completed') {
    return { status: 'completed', ...base, pct: 100, processed: base.total, summary: job.returnvalue }
  }
  if (state === 'failed') {
    return { status: 'failed', ...base, error: job.failedReason || 'Unknown error' }
  }

  return { status: state, ...base }
})

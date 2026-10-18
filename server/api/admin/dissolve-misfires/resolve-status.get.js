// server/api/admin/dissolve-misfires/resolve-status.get.js
// Polled by the Misfires modal's progress view — mirrors
// server/api/admin/cmoons/backfill-points-status.get.js's job.getState() + job.progress shape.
// jobId is optional: with no jobId (e.g. the modal was just reopened) this scans the queue's own
// active/waiting/delayed jobs so reopening the modal can resume showing progress.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { dissolveMisfireResolveQueue } from '@/server/utils/queues'

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
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { jobId } = getQuery(event)

  let job = null
  if (typeof jobId === 'string' && jobId) {
    job = await dissolveMisfireResolveQueue.getJob(jobId)
    if (!job) return { status: 'not_found', ...IDLE }
  } else {
    const inFlight = await dissolveMisfireResolveQueue.getJobs(['active', 'waiting', 'delayed'])
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

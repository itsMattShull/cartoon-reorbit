// server/api/admin/users/transfer-status.get.js
import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { transferQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { jobId } = getQuery(event)
  if (typeof jobId !== 'string' || !jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }

  const job = await transferQueue.getJob(jobId)
  if (!job) {
    return { status: 'not_found', pct: 0, step: '' }
  }

  const state = await job.getState()
  const raw = job.progress
  const pct = typeof raw === 'object' && raw !== null ? (raw.pct ?? 0) : (typeof raw === 'number' ? raw : 0)
  const step = typeof raw === 'object' && raw !== null ? (raw.step ?? '') : ''

  if (state === 'completed') {
    return { status: 'completed', pct: 100, step: 'Done', summary: job.returnvalue }
  }
  if (state === 'failed') {
    return { status: 'failed', pct, step, error: job.failedReason || 'Unknown error' }
  }

  return { status: state, pct, step }
})

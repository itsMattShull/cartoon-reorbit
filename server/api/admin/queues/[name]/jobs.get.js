// GET /api/admin/queues/:name/jobs?state=failed&limit=25&offset=0 — newest-first page of jobs in one state.
import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAdmin, requireQueue, serializeJob, JOB_STATES } from '@/server/utils/queueAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { queue } = requireQueue(event)
  const q = getQuery(event)
  const state = String(q.state || 'waiting')
  if (!JOB_STATES.includes(state)) throw createError({ statusCode: 400, statusMessage: 'Invalid state' })
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100)
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0)

  const [jobs, counts] = await Promise.all([
    // Finished/failed lists are most useful newest-first; the waiting list oldest-first (next to run).
    queue.getJobs([state], offset, offset + limit - 1, state === 'waiting' || state === 'prioritized'),
    queue.getJobCounts(state),
  ])
  return { state, total: counts[state] || 0, jobs: jobs.filter(Boolean).map(serializeJob) }
})

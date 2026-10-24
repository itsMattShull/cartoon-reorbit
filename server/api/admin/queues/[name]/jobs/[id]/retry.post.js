// POST /api/admin/queues/:name/jobs/:id/retry — re-queue one FAILED job.
import { defineEventHandler, createError } from 'h3'
import { requireQueueAdmin, requireQueue } from '@/server/utils/queueAdmin'

export default defineEventHandler(async (event) => {
  await requireQueueAdmin(event)
  const { queue } = requireQueue(event)
  const job = await queue.getJob(decodeURIComponent(String(event.context.params?.id || '')))
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  if ((await job.getState()) !== 'failed') throw createError({ statusCode: 400, statusMessage: 'Only failed jobs can be retried' })
  await job.retry('failed')
  return { ok: true }
})

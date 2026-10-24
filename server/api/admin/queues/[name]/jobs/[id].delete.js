// DELETE /api/admin/queues/:name/jobs/:id — remove one job (not allowed while it is running).
import { defineEventHandler, createError } from 'h3'
import { requireQueueAdmin, requireQueue } from '@/server/utils/queueAdmin'

export default defineEventHandler(async (event) => {
  await requireQueueAdmin(event)
  const { queue } = requireQueue(event)
  const job = await queue.getJob(decodeURIComponent(String(event.context.params?.id || '')))
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  if ((await job.getState()) === 'active') throw createError({ statusCode: 409, statusMessage: 'Job is running right now' })
  await job.remove()
  return { ok: true }
})

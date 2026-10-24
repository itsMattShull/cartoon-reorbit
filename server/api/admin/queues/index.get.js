// GET /api/admin/queues — overview of every BullMQ queue (counts, workers, backlog age, status).
import { defineEventHandler } from 'h3'
import { requireQueueAdmin, queueOverview } from '@/server/utils/queueAdmin'
import { getQueueRegistry } from '@/server/utils/queueRegistry'

export default defineEventHandler(async (event) => {
  await requireQueueAdmin(event)
  const now = Date.now()
  return Promise.all([...getQueueRegistry().values()].map(e => queueOverview(e, now)))
})

// GET /api/admin/queues — overview of every BullMQ queue (counts, workers, backlog age, status).
import { defineEventHandler } from 'h3'
import { requireAdmin, queueOverview } from '@/server/utils/queueAdmin'
import { getQueueRegistry } from '@/server/utils/queueRegistry'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const now = Date.now()
  return Promise.all([...getQueueRegistry().values()].map(e => queueOverview(e, now)))
})

// POST /api/admin/queues/:name/clean { state: 'failed' | 'completed' } — delete all finished jobs of one state.
import { defineEventHandler, readBody, createError } from 'h3'
import { requireQueueAdmin, requireQueue } from '@/server/utils/queueAdmin'

export default defineEventHandler(async (event) => {
  await requireQueueAdmin(event)
  const { queue } = requireQueue(event)
  const body = (await readBody(event).catch(() => null)) || {}
  const state = String(body.state || '')
  if (!['failed', 'completed'].includes(state)) throw createError({ statusCode: 400, statusMessage: 'state must be failed or completed' })
  const removed = await queue.clean(0, 100000, state)
  return { ok: true, removed: removed.length }
})

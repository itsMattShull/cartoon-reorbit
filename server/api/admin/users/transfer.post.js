// server/api/admin/users/transfer.post.js
// Enqueues a background job that moves all points + cToons from one user to
// another, then deactivates the source. Only enqueues — the actual work runs
// in server/workers/transfer.worker.js so a large account doesn't block the
// request or risk a half-applied transfer if the HTTP request is interrupted.
import { defineEventHandler, readBody, createError } from 'h3'
import { v4 as uuidv4 } from 'uuid'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { transferQueue } from '@/server/utils/queues'
import { resolveTransferPair, assertNoOverlappingTransfer } from '@/server/utils/transferValidation'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event).catch(() => ({})) || {}
  const { sourceUserId, targetUserId } = body
  if (typeof sourceUserId !== 'string' || typeof targetUserId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'sourceUserId and targetUserId are required' })
  }

  // Re-validate server-side — never trust that the client's preview call is
  // still accurate by the time the admin clicks through both confirmations.
  const { source, target } = await resolveTransferPair(sourceUserId, targetUserId)
  await assertNoOverlappingTransfer(source.id, target.id)

  const jobId = uuidv4()
  const job = await transferQueue.add(
    'transfer',
    {
      sourceUserId: source.id,
      sourceUsername: source.username,
      targetUserId: target.id,
      targetUsername: target.username,
      adminId: me.id,
      adminUsername: me.username || me.id,
    },
    { jobId }
  )

  return { jobId: job.id }
})

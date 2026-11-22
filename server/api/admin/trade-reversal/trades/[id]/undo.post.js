// POST /api/admin/trade-reversal/trades/:id/undo  { includeFairMarketValue: boolean }
// Undoes an accepted trade (see server/utils/tradeReversal.js) and streams its progress as server-sent events:
//   { type: 'start', totalSteps }  { type: 'step', done, totalSteps, label }
//   { type: 'complete', summary }  { type: 'error', message }
// Auth and input are checked before the stream opens, so those failures come back as ordinary HTTP errors.
import { defineEventHandler, readBody, createError, createEventStream } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { executeTradeReversal, describeTradeReversalError } from '@/server/utils/tradeReversal'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const admin = await requireAdmin(event)
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Trade id is required.' })
  const body = await readBody(event).catch(() => ({}))
  const includeFairMarketValue = body?.includeFairMarketValue === true

  const stream = createEventStream(event)
  const push = (obj) => stream.push(JSON.stringify(obj))

  ;(async () => {
    try {
      const summary = await executeTradeReversal(prisma, {
        offerId: id,
        includeFairMarketValue,
        admin,
        onProgress: push
      })
      await push({ type: 'complete', summary })
    } catch (err) {
      console.error('[trade-reversal] failed', id, err)
      try {
        await push({ type: 'error', message: describeTradeReversalError(err), rolledBack: true })
      } catch { /* stream already gone */ }
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})

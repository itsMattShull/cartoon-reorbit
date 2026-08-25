// GET /api/admin/cmoons/[id]/dispersals/[dispersalId]/recipients — per-member detail for one
// dispersal, fetched on demand (not on every poll tick — see the parent [dispersalId].get.js
// summary route). Pass ?onlyFailed=1 to fetch just the FAILED/PARTIAL rows, which is what the
// admin UI shows by default so a large cMoon's results view doesn't have to render/scroll a
// list of hundreds of successful rows just to find the handful that need attention.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

const RECIPIENTS_LIMIT = 500

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const cMoonId = event.context.params?.id
  const dispersalId = event.context.params?.dispersalId
  if (!cMoonId || !dispersalId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const dispersal = await db.cMoonDispersal.findUnique({
    where: { id: dispersalId },
    select: { id: true, cMoonId: true },
  })
  // Same IDOR guard as the summary route — the dispersal must belong to this cMoon.
  if (!dispersal || dispersal.cMoonId !== cMoonId) throw createError({ statusCode: 404, statusMessage: 'Dispersal not found' })

  const query = getQuery(event)
  const onlyFailed = query?.onlyFailed === '1' || query?.onlyFailed === 'true'
  const where = { dispersalId, ...(onlyFailed ? { status: { in: ['FAILED', 'PARTIAL'] } } : {}) }

  const [recipients, total] = await Promise.all([
    db.cMoonDispersalRecipient.findMany({
      where,
      orderBy: { username: 'asc' },
      take: RECIPIENTS_LIMIT,
      select: {
        userId: true, username: true, quantityRequested: true, quantityMinted: true,
        failedCount: true, status: true, mintNumbers: true, error: true,
      },
    }),
    db.cMoonDispersalRecipient.count({ where }),
  ])

  return { recipients, total, truncated: total > recipients.length }
})

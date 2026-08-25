// GET /api/admin/cmoon-dispersal-offers/[offerId]/claims — per-member claim detail, fetched on
// demand (not on every summary poll — see the parent [offerId].get.js). Pass ?onlyFailed=1 for
// just the FAILED/PARTIAL rows.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

const CLAIMS_LIMIT = 500

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const offerId = event.context.params?.offerId
  if (!offerId) throw createError({ statusCode: 400, statusMessage: 'Missing offer id' })

  const offer = await db.cMoonDispersalOffer.findUnique({ where: { id: offerId }, select: { id: true } })
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })

  const query = getQuery(event)
  const onlyFailed = query?.onlyFailed === '1' || query?.onlyFailed === 'true'
  const where = { offerId, ...(onlyFailed ? { status: { in: ['FAILED', 'PARTIAL'] } } : {}) }

  const [claims, total] = await Promise.all([
    db.cMoonDispersalClaim.findMany({
      where,
      orderBy: { claimedAt: 'desc' },
      take: CLAIMS_LIMIT,
      select: {
        userId: true, username: true, quantity: true, quantityMinted: true, failedCount: true,
        status: true, mintNumbers: true, error: true, claimedAt: true,
        cMoon: { select: { name: true } },
        ctoon: { select: { name: true } },
      },
    }),
    db.cMoonDispersalClaim.count({ where }),
  ])

  return {
    claims: claims.map(c => ({
      userId: c.userId,
      username: c.username,
      cMoonName: c.cMoon?.name || '',
      ctoonName: c.ctoon?.name || '',
      quantity: c.quantity,
      quantityMinted: c.quantityMinted,
      failedCount: c.failedCount,
      status: c.status,
      mintNumbers: c.mintNumbers,
      error: c.error,
      claimedAt: c.claimedAt,
    })),
    total,
    truncated: total > claims.length,
  }
})

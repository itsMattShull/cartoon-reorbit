// GET /api/admin/cmoon-dispersal-offers/[offerId] — summary for one offer, including a live
// claim-status breakdown. This is the polling target for the admin management view; it stays
// cheap regardless of how many members have claimed because it's a single indexed groupBy
// rather than fetching every claim row (see claims.get.js for the on-demand full list).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const offerId = event.context.params?.offerId
  if (!offerId) throw createError({ statusCode: 400, statusMessage: 'Missing offer id' })

  const offer = await db.cMoonDispersalOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true, quantityPerMember: true, status: true, createdAt: true, closedAt: true,
      initiatedBy: { select: { username: true } },
      closedBy: { select: { username: true } },
      cMoons: { select: { cMoon: { select: { id: true, name: true, memberCount: true } } } },
      options: { orderBy: { sortOrder: 'asc' }, select: { id: true, ctoon: { select: { id: true, name: true, assetPath: true } } } },
    },
  })
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })

  const [statusCounts, optionCounts] = await Promise.all([
    db.cMoonDispersalClaim.groupBy({ by: ['status'], where: { offerId }, _count: true }),
    db.cMoonDispersalClaim.groupBy({ by: ['optionId'], where: { offerId }, _count: true }),
  ])
  const byStatus = Object.fromEntries(statusCounts.map(s => [s.status, s._count]))
  const claimsByOption = Object.fromEntries(optionCounts.map(o => [o.optionId, o._count]))

  return {
    id: offer.id,
    quantityPerMember: offer.quantityPerMember,
    status: offer.status,
    createdAt: offer.createdAt,
    closedAt: offer.closedAt,
    initiatedByUsername: offer.initiatedBy?.username || '',
    closedByUsername: offer.closedBy?.username || '',
    cMoons: offer.cMoons.map(c => ({ id: c.cMoon.id, name: c.cMoon.name, memberCount: c.cMoon.memberCount })),
    options: offer.options.map(opt => ({
      id: opt.id,
      ctoonId: opt.ctoon.id,
      name: opt.ctoon.name,
      assetPath: opt.ctoon.assetPath,
      claimCount: claimsByOption[opt.id] || 0,
    })),
    totalClaims: statusCounts.reduce((sum, s) => sum + s._count, 0),
    queued: byStatus.QUEUED || 0,
    completed: byStatus.COMPLETED || 0,
    partial: byStatus.PARTIAL || 0,
    failed: byStatus.FAILED || 0,
  }
})

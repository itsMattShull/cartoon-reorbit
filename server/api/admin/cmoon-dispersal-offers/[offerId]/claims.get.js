// GET /api/admin/cmoon-dispersal-offers/[offerId]/claims — the per-member claim list, fetched on
// demand (not on every summary poll — see the parent [offerId].get.js). This is who picked what
// and when; it does not report mint outcomes (no status/mint-number column) — see the note on
// CMoonDispersalClaim in prisma/schema.prisma for why.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

const CLAIMS_LIMIT = 500

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const offerId = event.context.params?.offerId
  if (!offerId) throw createError({ statusCode: 400, statusMessage: 'Missing offer id' })

  const offer = await db.cMoonDispersalOffer.findUnique({ where: { id: offerId }, select: { id: true } })
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })

  const [claims, total] = await Promise.all([
    db.cMoonDispersalClaim.findMany({
      where: { offerId },
      orderBy: { claimedAt: 'desc' },
      take: CLAIMS_LIMIT,
      select: {
        userId: true, username: true, quantity: true, claimedAt: true,
        cMoon: { select: { name: true } },
        ctoon: { select: { name: true } },
      },
    }),
    db.cMoonDispersalClaim.count({ where: { offerId } }),
  ])

  return {
    claims: claims.map(c => ({
      userId: c.userId,
      username: c.username,
      cMoonName: c.cMoon?.name || '',
      ctoonName: c.ctoon?.name || '',
      quantity: c.quantity,
      claimedAt: c.claimedAt,
    })),
    total,
    truncated: total > claims.length,
  }
})

// GET /api/admin/cmoon-dispersal-offers — list dispersal offers, newest first. Pass ?cMoonId=
// to scope to offers linked to one cMoon (the normal entry point — opened from that cMoon's row
// in Admin cMoon — but an offer can span several cMoons, so this is a filter, not an owner).
import { defineEventHandler, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { serializeDispersalOption } from '@/server/utils/cmoonDispersal'

const LIST_LIMIT = 30

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const cMoonId = typeof query?.cMoonId === 'string' ? query.cMoonId : ''

  const offers = await db.cMoonDispersalOffer.findMany({
    where: cMoonId ? { cMoons: { some: { cMoonId } } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true, quantityPerMember: true, status: true, createdAt: true, closedAt: true,
      initiatedBy: { select: { username: true } },
      closedBy: { select: { username: true } },
      cMoons: { select: { cMoon: { select: { id: true, name: true } } } },
      options: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          ctoon: { select: { id: true, name: true, assetPath: true } },
          pack: { select: { id: true, name: true, imagePath: true } },
        },
      },
      _count: { select: { claims: true } },
    },
  })

  return {
    offers: offers.map(o => ({
      id: o.id,
      quantityPerMember: o.quantityPerMember,
      status: o.status,
      createdAt: o.createdAt,
      closedAt: o.closedAt,
      initiatedByUsername: o.initiatedBy?.username || '',
      closedByUsername: o.closedBy?.username || '',
      cMoons: o.cMoons.map(c => ({ id: c.cMoon.id, name: c.cMoon.name })),
      // Each option is a cToon or a Pack, never both — see serializeDispersalOption's own
      // comment. `kind` lets the admin UI render the right image/label without re-deriving it.
      options: o.options.map(opt => serializeDispersalOption(opt)),
      totalClaims: o._count?.claims ?? 0,
    })),
  }
})

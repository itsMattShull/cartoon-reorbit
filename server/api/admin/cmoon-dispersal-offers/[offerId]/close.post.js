// POST /api/admin/cmoon-dispersal-offers/[offerId]/close — manually close an open offer. Closing
// only stops new claims (server/api/cmoon/[id]/dispersal-offers/[offerId]/claim.post.js checks
// status === 'OPEN'); it never touches claims already made, in flight, or their mint jobs.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const offerId = event.context.params?.offerId
  if (!offerId) throw createError({ statusCode: 400, statusMessage: 'Missing offer id' })

  const offer = await db.cMoonDispersalOffer.findUnique({ where: { id: offerId }, select: { id: true, status: true } })
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  if (offer.status !== 'OPEN') throw createError({ statusCode: 400, statusMessage: 'This offer is already closed' })

  await db.cMoonDispersalOffer.update({
    where: { id: offerId },
    data: { status: 'CLOSED', closedById: me.id, closedAt: new Date() },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'cMoonDispersalOffer',
    key: `close:${offerId}`,
    prevValue: 'OPEN',
    newValue: 'CLOSED',
  })

  return { ok: true }
})

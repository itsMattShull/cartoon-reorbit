// GET /api/cmoon/[id]/dispersal-offers — offers linked to this cMoon: every currently OPEN one
// (so members can pick), plus any the viewer has already claimed even if since closed (so they
// can still see what they got). `eligible` reflects whether the viewer is a CURRENT member of
// *this* cMoon — the same offer can be linked to several cMoons at once, but a member only picks
// from the page of the cMoon they're actually in; claim.post.js re-checks this server-side
// regardless of what this endpoint says.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const [me, offers] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { cMoonId: true } }),
    db.cMoonDispersalOffer.findMany({
      where: {
        cMoons: { some: { cMoonId: id } },
        OR: [{ status: 'OPEN' }, { claims: { some: { userId } } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, quantityPerMember: true, status: true, createdAt: true,
        options: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, ctoon: { select: { id: true, name: true, assetPath: true } } },
        },
        claims: { where: { userId }, select: { optionId: true, quantity: true } },
      },
    }),
  ])

  return {
    eligible: me?.cMoonId === id,
    offers: offers.map(o => ({
      id: o.id,
      quantityPerMember: o.quantityPerMember,
      status: o.status,
      options: o.options.map(opt => ({ id: opt.id, ctoonId: opt.ctoon.id, name: opt.ctoon.name, assetPath: opt.ctoon.assetPath })),
      myClaim: o.claims[0] ? { optionId: o.claims[0].optionId, quantity: o.claims[0].quantity } : null,
    })),
  }
})

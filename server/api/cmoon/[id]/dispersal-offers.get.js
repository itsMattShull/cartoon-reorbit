// GET /api/cmoon/[id]/dispersal-offers — every offer ever linked to this cMoon, open or closed,
// for the "cMoon Offers" modal (CMoonOffersModal.vue via CMoonPage.vue) to show as past + current.
// `eligible` reflects whether the viewer is a CURRENT member of *this* cMoon — the same offer can
// be linked to several cMoons at once, but a member only picks from the page of the cMoon they're
// actually in; claim.post.js re-checks this server-side regardless of what this endpoint says.
// `createdAt`/`closedAt` are exposed so a closed offer can show the dates it was available.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { OG_GTOON_DISPLAY_SELECT, ogGtoonDisplay } from '~/server/utils/ogGtoonDisplay'
import { serializeDispersalOption } from '@/server/utils/cmoonDispersal'

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
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, quantityPerMember: true, status: true, createdAt: true, closedAt: true,
        options: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            ctoon: { select: { id: true, name: true, assetPath: true, ...OG_GTOON_DISPLAY_SELECT } },
            pack: { select: { id: true, name: true, imagePath: true } },
          },
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
      createdAt: o.createdAt,
      closedAt: o.closedAt,
      // Each option is a cToon or a Pack, never both — see CMoonDispersalOption's own schema
      // comment. Shared shape with the admin endpoints via serializeDispersalOption (server/utils/
      // cmoonDispersal.js) so the two can never drift apart on it; ogGtoonDisplay's OG-gToon
      // special rendering is player-facing only, so it's layered on top as `extra` rather than
      // folded into the shared helper itself.
      options: o.options.map(opt => serializeDispersalOption(opt, opt.ctoon ? ogGtoonDisplay(opt.ctoon) : {})),
      myClaim: o.claims[0] ? { optionId: o.claims[0].optionId, quantity: o.claims[0].quantity } : null,
    })),
  }
})

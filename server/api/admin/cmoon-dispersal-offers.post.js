// POST /api/admin/cmoon-dispersal-offers — create a "pick one of these cToons" offer, live on
// one or more cMoons at once. Unlike the old instant-push dispersal, this doesn't snapshot or
// enqueue anything for members up front — it just opens the offer; each member's mint job is
// only created when they actually claim (see server/api/cmoon/[id]/dispersal-offers/[offerId]/
// claim.post.js), which is also where the atomic mint-number assignment and the cToon's own
// quantity cap are enforced. No admin-side "remaining supply" pre-check here by design: the
// mint transaction's existing sold-out guard is the single source of truth, and claims that lose
// that race just land as a FAILED claim (visible in the admin claims list) rather than blocking
// offer creation on a guess about eventual claim volume.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const MAX_QUANTITY_PER_MEMBER = 10
const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
const MAX_CMOONS = 50

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const cMoonIds = Array.isArray(body?.cMoonIds) ? [...new Set(body.cMoonIds.filter(x => typeof x === 'string'))] : []
  const ctoonIds = Array.isArray(body?.ctoonIds) ? [...new Set(body.ctoonIds.filter(x => typeof x === 'string'))] : []
  const quantityPerMember = Math.floor(Number(body?.quantityPerMember))

  if (!cMoonIds.length) throw createError({ statusCode: 400, statusMessage: 'Select at least one cMoon' })
  if (cMoonIds.length > MAX_CMOONS) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_CMOONS} cMoons per offer` })
  if (ctoonIds.length < MIN_OPTIONS) throw createError({ statusCode: 400, statusMessage: `Add at least ${MIN_OPTIONS} cToon options for members to choose between` })
  if (ctoonIds.length > MAX_OPTIONS) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_OPTIONS} cToon options per offer` })
  if (!Number.isFinite(quantityPerMember) || quantityPerMember < 1 || quantityPerMember > MAX_QUANTITY_PER_MEMBER) {
    throw createError({ statusCode: 400, statusMessage: `Quantity per member must be between 1 and ${MAX_QUANTITY_PER_MEMBER}` })
  }

  const [cMoonCount, ctoons] = await Promise.all([
    db.cMoon.count({ where: { id: { in: cMoonIds } } }),
    db.ctoon.findMany({ where: { id: { in: ctoonIds } }, select: { id: true, name: true, quantity: true } }),
  ])
  if (cMoonCount !== cMoonIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more cMoons do not exist' })
  if (ctoons.length !== ctoonIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more cToons do not exist' })
  // Only unlimited-quantity cToons (quantity === null) are eligible — an offer stays open to an
  // unknown, open-ended number of future claimants, so a finite-quantity cToon could silently
  // sell out mid-offer. Re-checked here regardless of what the admin UI already filtered to,
  // since the client-side list can never be trusted as the actual gate.
  const limited = ctoons.filter(c => c.quantity !== null)
  if (limited.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `These cToons have a limited quantity and can't be offered: ${limited.map(c => c.name).join(', ')}`,
    })
  }

  const offer = await db.$transaction(async (tx) => {
    const created = await tx.cMoonDispersalOffer.create({
      data: { quantityPerMember, initiatedById: me.id },
      select: { id: true },
    })
    await tx.cMoonDispersalOfferCMoon.createMany({
      data: cMoonIds.map(cMoonId => ({ offerId: created.id, cMoonId })),
    })
    await tx.cMoonDispersalOption.createMany({
      data: ctoonIds.map((ctoonId, i) => ({ offerId: created.id, ctoonId, sortOrder: i })),
    })
    return created
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'cMoonDispersalOffer',
    key: `create:${offer.id}`,
    prevValue: null,
    newValue: { offerId: offer.id, cMoonIds, ctoonIds, ctoonNames: ctoons.map(c => c.name), quantityPerMember },
  })

  return { offerId: offer.id }
})

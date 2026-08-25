// POST /api/cmoon/[id]/dispersal-offers/[offerId]/claim — a member picks one option from an
// open offer. Eligibility is re-checked here against the member's real, live cMoonId (never
// trusted from the client or from which page they happened to submit from) against the offer's
// actual linked cMoons — the route's `id` is only used to confirm the offer is meant to be
// reachable from this cMoon's page. One claim per (offer, user) — enforced by a DB unique
// constraint, not just an app-level check, so a double-click/double-submit race can't create two
// claims; the second attempt simply gets the same "already claimed" error.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { mintQueue } from '@/server/utils/queues'

// Lower number = higher priority in BullMQ. The mint worker runs at concurrency:1 for the whole
// app (cMart, code redemption, prizes, dispersal claims all share it) — leaving ordinary mints
// unprioritized keeps them ahead of a burst of claims (e.g. many members claiming right when an
// offer opens).
const CLAIM_JOB_PRIORITY = 100

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  const offerId = event.context.params?.offerId
  if (!cMoonId || !offerId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const optionId = typeof body?.optionId === 'string' ? body.optionId : ''
  if (!optionId) throw createError({ statusCode: 400, statusMessage: 'optionId is required' })

  const [me, offer] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { username: true, cMoonId: true, banned: true, active: true } }),
    db.cMoonDispersalOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true, status: true, quantityPerMember: true,
        cMoons: { select: { cMoonId: true } },
        options: { select: { id: true, ctoonId: true } },
      },
    }),
  ])
  if (!me || me.banned || me.active === false) throw createError({ statusCode: 403, statusMessage: 'Account not eligible' })
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  if (!offer.cMoons.some(c => c.cMoonId === cMoonId)) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  if (offer.status !== 'OPEN') throw createError({ statusCode: 400, statusMessage: 'This offer is closed' })
  if (!me.cMoonId || !offer.cMoons.some(c => c.cMoonId === me.cMoonId)) {
    throw createError({ statusCode: 403, statusMessage: 'You must currently be a member of an eligible cMoon to claim this' })
  }

  const option = offer.options.find(o => o.id === optionId)
  if (!option) throw createError({ statusCode: 400, statusMessage: 'Invalid option' })

  let claim
  try {
    claim = await db.cMoonDispersalClaim.create({
      data: {
        offerId,
        optionId: option.id,
        ctoonId: option.ctoonId,
        userId,
        username: me.username,
        cMoonId: me.cMoonId,
        quantity: offer.quantityPerMember,
      },
      select: { id: true },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: "You've already claimed this offer" })
    }
    throw err
  }

  const jobs = []
  for (let copy = 0; copy < offer.quantityPerMember; copy++) {
    jobs.push({
      name: 'mintCtoon',
      data: {
        userId,
        ctoonId: option.ctoonId,
        isSpecial: true,
        method: 'CMOON_DISPERSAL',
        dispersalClaimId: claim.id,
      },
      opts: { jobId: `dispersal-claim:${claim.id}:${copy}`, priority: CLAIM_JOB_PRIORITY },
    })
  }
  await mintQueue.addBulk(jobs)

  return { claimId: claim.id, optionId: option.id, quantity: offer.quantityPerMember }
})

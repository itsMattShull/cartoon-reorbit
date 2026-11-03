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
// 1 allows a plain "everyone gets this one cToon" offer, same create/claim flow as a multi-option
// offer with no branch for it — a single-option offer is just an offer whose only
// CMoonDispersalOption happens to be the only one, so the player-facing card/Claim flow in
// CMoonPage.vue only needs to skip the "pick one" framing, not a different code path.
const MIN_OPTIONS = 1
const MAX_OPTIONS = 10
const MAX_CMOONS = 50

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const cMoonIds = Array.isArray(body?.cMoonIds) ? [...new Set(body.cMoonIds.filter(x => typeof x === 'string'))] : []
  // Each option is a cToon or a Pack, never both (see CMoonDispersalOption's own schema comment) —
  // the admin UI sends one combined, ordered list rather than two parallel id arrays, since that's
  // what it needs to track anyway (sortOrder = pick order). Dedup'd per-kind: the same cToon or
  // pack can't be offered twice on one offer, but a cToon and a pack sharing an id is impossible
  // (different tables), so no cross-kind dedup is needed.
  const rawOptions = Array.isArray(body?.options) ? body.options : []
  const seen = new Set()
  const options = []
  for (const o of rawOptions) {
    const kind = o?.kind === 'PACK' ? 'PACK' : (o?.kind === 'CTOON' ? 'CTOON' : null)
    const id = typeof o?.id === 'string' ? o.id : null
    if (!kind || !id) continue
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ kind, id })
  }
  const quantityPerMember = Math.floor(Number(body?.quantityPerMember))

  if (!cMoonIds.length) throw createError({ statusCode: 400, statusMessage: 'Select at least one cMoon' })
  if (cMoonIds.length > MAX_CMOONS) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_CMOONS} cMoons per offer` })
  if (options.length < MIN_OPTIONS) throw createError({ statusCode: 400, statusMessage: 'Add at least one option to offer' })
  if (options.length > MAX_OPTIONS) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_OPTIONS} options per offer` })
  if (!Number.isFinite(quantityPerMember) || quantityPerMember < 1 || quantityPerMember > MAX_QUANTITY_PER_MEMBER) {
    throw createError({ statusCode: 400, statusMessage: `Quantity per member must be between 1 and ${MAX_QUANTITY_PER_MEMBER}` })
  }

  const ctoonIds = options.filter(o => o.kind === 'CTOON').map(o => o.id)
  const packIds = options.filter(o => o.kind === 'PACK').map(o => o.id)

  const [cMoonCount, ctoons, packs] = await Promise.all([
    db.cMoon.count({ where: { id: { in: cMoonIds } } }),
    ctoonIds.length ? db.ctoon.findMany({ where: { id: { in: ctoonIds } }, select: { id: true, name: true, quantity: true } }) : [],
    packIds.length ? db.pack.findMany({ where: { id: { in: packIds } }, select: { id: true, name: true } }) : [],
  ])
  if (cMoonCount !== cMoonIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more cMoons do not exist' })
  if (ctoons.length !== ctoonIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more cToons do not exist' })
  if (packs.length !== packIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more packs do not exist' })
  // Only unlimited-quantity cToons (quantity === null) are eligible — an offer stays open to an
  // unknown, open-ended number of future claimants, so a finite-quantity cToon could silently
  // sell out mid-offer. Re-checked here regardless of what the admin UI already filtered to,
  // since the client-side list can never be trusted as the actual gate. No analogous check for
  // packs — Pack has no supply-cap concept like Ctoon.quantity, so every pack is eligible.
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
      data: options.map((o, i) => ({
        offerId: created.id,
        ctoonId: o.kind === 'CTOON' ? o.id : null,
        packId: o.kind === 'PACK' ? o.id : null,
        sortOrder: i,
      })),
    })
    return created
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'cMoonDispersalOffer',
    key: `create:${offer.id}`,
    prevValue: null,
    newValue: {
      offerId: offer.id, cMoonIds, options,
      ctoonNames: ctoons.map(c => c.name), packNames: packs.map(p => p.name),
      quantityPerMember,
    },
  })

  return { offerId: offer.id }
})

// GET /api/trade/user-packs            -> my own tradable packs
// GET /api/trade/user-packs?username=x -> that player's, for the trade builder
//
// Sealed packs that could go into a trade right now, GROUPED BY TYPE: [{ packId, name, imagePath, available }].
// "Available" = sealed and in neither an active auction nor a pending trade. That is all a caller learns — never row
// ids, when a pack was acquired, where it came from, what was paid, or WHY a pack isn't counted (in an auction, in a
// trade and opened are indistinguishable). Offers name "2 x Starter Pack" and the server picks the copies
// (server/utils/userPackState.js#lockAndPickPacks), so nobody ever needs another player's pack ids.
//
// Packs are tradable by default (no opt-in), which makes this a way to look at another player's holdings, so it needs
// a login and is rate-limited.
import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { rateLimit } from '@/server/utils/rateLimit'
import { isUuid } from '@/server/utils/tradeOfferRules'

export default defineEventHandler(async (event) => {
  const me = event.context.userId
  if (!me) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  setHeader(event, 'Cache-Control', 'no-store')

  const rl = await rateLimit(`user-packs:${me}`, { limit: 60, windowSec: 60 })
  if (!rl.allowed) throw createError({ statusCode: 429, statusMessage: 'Slow down — too many lookups. Try again in a minute.' })

  const username = typeof getQuery(event).username === 'string' ? getQuery(event).username.trim() : ''
  let target = { id: me }
  if (username) {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } })
    if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
    target = user
  }

  // Counter-offer mode: the offer being countered is about to be replaced, so packs held by IT are still available to the
  // counter. Honoured only when the caller is a party to that PENDING offer (anyone else gets the plain answer), and
  // scoped by OFFER id — same rule the counter endpoint applies (server/utils/userPackState.js, excludeOfferIds).
  const rawExclude = getQuery(event).excludeOfferId
  let excludeOfferId = null
  if (typeof rawExclude === 'string' && isUuid(rawExclude)) {
    const src = await prisma.tradeOffer.findFirst({
      where: { id: rawExclude, status: 'PENDING', OR: [{ initiatorId: me }, { recipientId: me }] },
      select: { id: true }
    })
    excludeOfferId = src?.id ?? null
  }

  const groups = await prisma.userPack.groupBy({
    by: ['packId'],
    where: {
      userId: target.id,
      opened: false,
      auctions: { none: { status: 'ACTIVE' } },
      tradeOfferPacks: { none: { tradeOffer: { status: 'PENDING', ...(excludeOfferId ? { id: { not: excludeOfferId } } : {}) } } }
    },
    _count: { _all: true }
  })
  const packs = groups.length
    ? await prisma.pack.findMany({ where: { id: { in: groups.map(g => g.packId) } }, select: { id: true, name: true, imagePath: true } })
    : []
  const byId = new Map(packs.map(p => [p.id, p]))

  return {
    packs: groups
      .map(g => ({ packId: g.packId, name: byId.get(g.packId)?.name || 'Pack', imagePath: byId.get(g.packId)?.imagePath || null, available: g._count._all }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
})

// server/api/packs/users/[username].get.js
// Lists a user's unopened sealed packs for trade-offer compose, mirroring
// server/api/collection/[username].get.js's shape and excludeTradeOfferId
// handling so Trade.vue's pack picker can reuse the same patterns as its
// cToon picker.
import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { username } = event.context.params
  const { excludeTradeOfferId } = getQuery(event)

  // Same reasoning as collection/[username].get.js: a counter re-proposes the
  // countered offer's own packs, which must not come back flagged unavailable.
  let excludeOfferId = null
  if (typeof excludeTradeOfferId === 'string' && excludeTradeOfferId) {
    const party = await prisma.tradeOffer.findFirst({
      where: {
        id: excludeTradeOfferId,
        OR: [{ initiatorId: requesterId }, { recipientId: requesterId }]
      },
      select: { id: true }
    })
    excludeOfferId = party?.id ?? null
  }

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const packs = await prisma.userPack.findMany({
    where: { userId: user.id, opened: false },
    select: {
      id: true,
      createdAt: true,
      pack: { select: { id: true, name: true, imagePath: true } }
    },
    orderBy: [{ pack: { name: 'asc' } }, { createdAt: 'asc' }]
  })
  if (!packs.length) return []

  const packIds = packs.map(p => p.id)
  const [pendingTradeRows, activeAuctionRows] = await Promise.all([
    prisma.tradeOfferPack.findMany({
      where: {
        userPackId: { in: packIds },
        tradeOffer: {
          status: 'PENDING',
          ...(excludeOfferId ? { id: { not: excludeOfferId } } : {})
        }
      },
      select: { userPackId: true }
    }),
    prisma.auction.findMany({
      where: { userPackId: { in: packIds }, status: 'ACTIVE' },
      select: { userPackId: true }
    })
  ])
  const pendingTradeSet = new Set(pendingTradeRows.map(r => r.userPackId))
  const activeAuctionSet = new Set(activeAuctionRows.map(r => r.userPackId))

  const isSelf = user.id === requesterId

  return packs.map(p => ({
    userPackId: p.id,
    packId: p.pack.id,
    name: p.pack.name,
    imagePath: p.pack.imagePath,
    // Same single-bit-of-information reasoning as collection/[username].get.js's
    // `unavailable`: another party only ever needs to know whether a pack can be
    // asked for, not why not.
    unavailable: pendingTradeSet.has(p.id) || activeAuctionSet.has(p.id),
    ...(isSelf ? { inPendingTrade: pendingTradeSet.has(p.id) } : {})
  }))
})

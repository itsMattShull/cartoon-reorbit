// server/api/my-packs.get.js
// Lists the caller's own sealed (unopened) packs — powers the "Sealed Packs" panel on My
// Collection (components/newsite/MyCollection.vue). Read-only; opening a pack is still the
// existing server/api/cmart/open-pack.get.js, which independently re-checks `unavailable`'s
// two components itself (this flag is purely so the UI can grey the button out in advance).
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const rows = await db.userPack.findMany({
    where: { userId: me.id, opened: false },
    select: {
      id: true,
      createdAt: true,
      pack: { select: { id: true, name: true, imagePath: true, price: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!rows.length) return []

  const packIds = rows.map(r => r.id)
  const [pendingTradeRows, activeAuctionRows] = await Promise.all([
    db.tradeOfferPack.findMany({
      where: { userPackId: { in: packIds }, tradeOffer: { status: 'PENDING' } },
      select: { userPackId: true }
    }),
    db.auction.findMany({
      where: { userPackId: { in: packIds }, status: 'ACTIVE' },
      select: { userPackId: true }
    })
  ])
  const pendingTradeSet = new Set(pendingTradeRows.map(r => r.userPackId))
  const activeAuctionSet = new Set(activeAuctionRows.map(r => r.userPackId))

  return rows.map(r => ({
    userPackId: r.id,
    packId: r.pack.id,
    name: r.pack.name,
    imagePath: r.pack.imagePath,
    price: r.pack.price,
    createdAt: r.createdAt,
    unavailable: pendingTradeSet.has(r.id) || activeAuctionSet.has(r.id)
  }))
})

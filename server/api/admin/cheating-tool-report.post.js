import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

const FALLBACK_RARITY_PRICES = {
  'Common':       100,
  'Uncommon':     200,
  'Rare':         400,
  'Very Rare':    750,
  'Crazy Rare':   1250,
  'Auction Only': 0,
  'Prize Only':   0,
  'Code Only':    0,
}

function cmartPriceForRarity(rarity, dbDefaults) {
  const key = (rarity || '').trim()
  if (dbDefaults[key]?.price !== undefined) return dbDefaults[key].price
  return FALLBACK_RARITY_PRICES[key] ?? 0
}

async function loadRarityDefaults() {
  const row = await prisma.globalGameConfig.findFirst({ select: { rarityDefaults: true } })
  const db = row?.rarityDefaults ?? {}
  const merged = {}
  for (const [k, v] of Object.entries(FALLBACK_RARITY_PRICES)) merged[k] = { price: v }
  for (const [k, v] of Object.entries(db)) {
    if (typeof v === 'object' && v !== null) merged[k] = v
  }
  return merged
}

async function avgAuctionPriceForCtoon(ctoonId) {
  const ucs = await prisma.userCtoon.findMany({ where: { ctoonId }, select: { id: true } })
  const ucIds = ucs.map(u => u.id)
  if (!ucIds.length) return { avg: 0, auctionCount: 0 }
  const agg = await prisma.auction.aggregate({
    where: { userCtoonId: { in: ucIds }, status: 'CLOSED', winnerId: { not: null }, highestBid: { gt: 0 } },
    _avg: { highestBid: true },
    _count: { id: true },
  })
  return { avg: Math.round(agg._avg.highestBid ?? 0), auctionCount: agg._count.id }
}

export default defineEventHandler(async (event) => {
  // admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const target = String(body?.target || '').trim()
  const suspects = Array.isArray(body?.suspects)
    ? body.suspects.map(s => String(s || '').trim()).filter(Boolean)
    : []
  if (!target) throw createError({ statusCode: 400, statusMessage: 'target is required' })
  if (!suspects.length) throw createError({ statusCode: 400, statusMessage: 'at least one suspect is required' })

  // resolve users
  const allNames = [target, 'CartoonReOrbitOfficial', ...suspects]
  const users = await prisma.user.findMany({
    where: { username: { in: allNames } },
    select: { id: true, username: true, points: true }
  })
  const idByName = new Map(users.map(u => [u.username, u.id]))
  const missing = [target, ...suspects].filter(n => !idByName.has(n))
  if (missing.length) throw createError({ statusCode: 400, statusMessage: `Unknown username(s): ${missing.join(', ')}` })

  const targetId   = idByName.get(target)
  const suspectIds = suspects.map(n => idByName.get(n))
  const suspectSet = new Set(suspectIds)
  const nameById   = new Map(users.map(u => [u.id, u.username]))

  const rarityDefaults = await loadRarityDefaults()

  // ── Section A: TradeRoom / Trade system ──────────────────────────────────

  const tradeRooms = await prisma.tradeRoom.findMany({
    where: {
      OR: [
        { traderAId: targetId,               traderBId: { in: suspectIds } },
        { traderAId: { in: suspectIds },      traderBId: targetId },
      ]
    },
    select: { id: true, traderAId: true, traderBId: true }
  })

  const roomIds = tradeRooms.map(r => r.id)
  const allTrades = roomIds.length
    ? await prisma.trade.findMany({
        where: { roomId: { in: roomIds } },
        select: { id: true, roomId: true, userId: true, confirmed: true }
      })
    : []

  const tradesByRoom = new Map()
  for (const t of allTrades) {
    if (!tradesByRoom.has(t.roomId)) tradesByRoom.set(t.roomId, [])
    tradesByRoom.get(t.roomId).push(t)
  }

  const confirmedRoomIds = []
  const pendingRoomsBySuspect = new Map()

  for (const room of tradeRooms) {
    const trades = tradesByRoom.get(room.id) ?? []
    const allConfirmed = trades.length > 0 && trades.every(t => t.confirmed)
    if (allConfirmed) {
      confirmedRoomIds.push(room.id)
    } else {
      const suspectId = suspectSet.has(room.traderAId) ? room.traderAId : room.traderBId
      const suspectName = nameById.get(suspectId) ?? String(suspectId)
      pendingRoomsBySuspect.set(suspectName, (pendingRoomsBySuspect.get(suspectName) ?? 0) + 1)
    }
  }

  // suspect-side trade IDs in confirmed rooms
  const suspectTradeIds = []
  for (const roomId of confirmedRoomIds) {
    for (const t of tradesByRoom.get(roomId) ?? []) {
      if (suspectSet.has(t.userId)) suspectTradeIds.push(t.id)
    }
  }

  const tradeRoomCtoons = suspectTradeIds.length
    ? await prisma.tradeCtoon.findMany({
        where: { tradeId: { in: suspectTradeIds } },
        select: {
          userCtoonId: true,
          userCtoon: {
            select: {
              id: true, userId: true, burnedAt: true,
              ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true } }
            }
          }
        }
      })
    : []

  // ── Section B: TradeOffer system ─────────────────────────────────────────

  // suspects initiated → target received ctoons + points
  const offersInitBySuspect = await prisma.tradeOffer.findMany({
    where: { status: 'ACCEPTED', initiatorId: { in: suspectIds }, recipientId: targetId },
    select: {
      id: true, initiatorId: true, pointsOffered: true,
      ctoons: {
        where: { role: 'OFFERED' },
        select: {
          userCtoonId: true,
          userCtoon: {
            select: {
              id: true, userId: true, burnedAt: true,
              ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true } }
            }
          }
        }
      }
    }
  })

  // target initiated → suspects gave requested ctoons to target
  const offersInitByTarget = await prisma.tradeOffer.findMany({
    where: { status: 'ACCEPTED', initiatorId: targetId, recipientId: { in: suspectIds } },
    select: {
      id: true, recipientId: true,
      ctoons: {
        where: { role: 'REQUESTED' },
        select: {
          userCtoonId: true,
          userCtoon: {
            select: {
              id: true, userId: true, burnedAt: true,
              ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true } }
            }
          }
        }
      }
    }
  })

  const tradeOfferPointsToTarget = offersInitBySuspect.reduce((sum, o) => sum + (o.pointsOffered ?? 0), 0)

  // pending TradeOffers (informational)
  const pendingOffers = await prisma.tradeOffer.findMany({
    where: {
      status: 'PENDING',
      OR: [
        { initiatorId: { in: suspectIds }, recipientId: targetId },
        { initiatorId: targetId,           recipientId: { in: suspectIds } },
      ]
    },
    select: { id: true, initiatorId: true, recipientId: true, pointsOffered: true }
  })

  // ── Section C: Collate all ctoons traded TO target ────────────────────────

  const tradedToTarget = new Map()
  for (const tc of tradeRoomCtoons) tradedToTarget.set(tc.userCtoonId, tc.userCtoon)
  for (const offer of offersInitBySuspect) {
    for (const tc of offer.ctoons) tradedToTarget.set(tc.userCtoonId, tc.userCtoon)
  }
  for (const offer of offersInitByTarget) {
    for (const tc of offer.ctoons) tradedToTarget.set(tc.userCtoonId, tc.userCtoon)
  }

  // aggregate by cToon type
  const ctoonStats = new Map()
  for (const uc of tradedToTarget.values()) {
    if (!uc?.ctoon) continue
    const c = uc.ctoon
    if (!ctoonStats.has(c.id)) {
      ctoonStats.set(c.id, { name: c.name, rarity: c.rarity, total: 0, instances: [] })
    }
    const stat = ctoonStats.get(c.id)
    stat.total++
    stat.instances.push(uc.id)
  }

  // which instances does target still own?
  const allInstanceIds = [...tradedToTarget.keys()]
  const targetCurrentOwned = allInstanceIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: allInstanceIds }, userId: targetId, burnedAt: null },
        select: { id: true, mintNumber: true, ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
      })
    : []
  const targetOwnsSet = new Set(targetCurrentOwned.map(u => u.id))

  // avg auction price per ctoon type
  const avgPriceByCtoon = new Map()
  for (const ctoonId of ctoonStats.keys()) {
    avgPriceByCtoon.set(ctoonId, await avgAuctionPriceForCtoon(ctoonId))
  }

  // ── Section D: Auctions (target sold, suspects won) ───────────────────────

  const suspectWonAuctions = await prisma.auction.findMany({
    where: { creatorId: targetId, status: 'CLOSED', winnerId: { in: suspectIds } },
    select: {
      id: true, highestBid: true, winnerId: true,
      userCtoon: { select: { ctoon: { select: { name: true } } } }
    }
  })
  const auctionPointsToTarget = suspectWonAuctions.reduce((sum, a) => sum + (a.highestBid ?? 0), 0)

  // ── Compute totals ────────────────────────────────────────────────────────

  let totalCtoonPointValue = 0
  const ctoonRows = []

  for (const [ctoonId, stat] of ctoonStats) {
    const ownedCount    = stat.instances.filter(id =>  targetOwnsSet.has(id)).length
    const notOwnedCount = stat.instances.filter(id => !targetOwnsSet.has(id)).length
    const rarityPx      = cmartPriceForRarity(stat.rarity, rarityDefaults)
    const { avg: avgPx, auctionCount } = avgPriceByCtoon.get(ctoonId)
    const unitPrice     = Math.max(rarityPx, avgPx)
    const lostValue     = unitPrice * notOwnedCount
    totalCtoonPointValue += lostValue

    ctoonRows.push({
      ctoonId,
      name: stat.name,
      rarity: stat.rarity,
      total: stat.total,
      ownedCount,
      notOwnedCount,
      rarityPx,
      avgPx,
      auctionCount,
      unitPrice,
      lostValue,
    })
  }

  const totalPointsToRemove = totalCtoonPointValue + tradeOfferPointsToTarget + auctionPointsToTarget

  // TradeOffer breakdown for display
  const tradeOfferBreakdown = offersInitBySuspect.map(o => ({
    suspectName: nameById.get(o.initiatorId) ?? String(o.initiatorId),
    pointsOffered: o.pointsOffered ?? 0,
  }))

  // Auction breakdown for display
  const auctionBreakdown = suspectWonAuctions.map(a => ({
    itemName: a.userCtoon?.ctoon?.name ?? '(unknown)',
    winnerName: nameById.get(a.winnerId) ?? String(a.winnerId),
    highestBid: a.highestBid ?? 0,
  }))

  // Pending breakdown for display
  const pendingRoomsDisplay = [...pendingRoomsBySuspect.entries()].map(([name, count]) => ({ name, count }))
  const pendingOffersDisplay = pendingOffers.map(o => {
    const isSuspectInitiator = suspectSet.has(o.initiatorId)
    return {
      suspectName: nameById.get(isSuspectInitiator ? o.initiatorId : o.recipientId) ?? '?',
      role: isSuspectInitiator ? 'initiator' : 'recipient',
      pointsOffered: o.pointsOffered ?? 0,
    }
  })

  // cToons target still owns (to transfer)
  const ctoonStillOwned = targetCurrentOwned

  return {
    target,
    suspects,
    // Section 1
    ctoonRows,
    totalCtoonPointValue,
    // Section 2
    tradeOfferBreakdown,
    tradeOfferPointsToTarget,
    // Section 3
    auctionBreakdown,
    auctionPointsToTarget,
    // Section 4 (pending, informational)
    pendingRoomsDisplay,
    pendingOffersDisplay,
    // Summary
    totalPointsToRemove,
    ctoonStillOwned,
    ctoonStillOwnedCount: ctoonStillOwned.length,
  }
})

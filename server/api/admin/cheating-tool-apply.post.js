import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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
  const users = await prisma.user.findMany({
    where: { username: { in: [target, 'CartoonReOrbitOfficial', ...suspects] } },
    select: { id: true, username: true }
  })
  const idByName = new Map(users.map(u => [u.username, u.id]))
  const missing = [target, 'CartoonReOrbitOfficial', ...suspects].filter(n => !idByName.has(n))
  if (missing.length) throw createError({ statusCode: 400, statusMessage: `Unknown username(s): ${missing.join(', ')}` })

  const targetId   = idByName.get(target)
  const officialId = idByName.get('CartoonReOrbitOfficial')
  const suspectIds = suspects.map(n => idByName.get(n))
  const suspectSet = new Set(suspectIds)

  // ── Re-derive cToons traded to target + points total ─────────────────────
  // (same logic as report endpoint so we always work on fresh data at apply time)

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
  for (const room of tradeRooms) {
    const trades = tradesByRoom.get(room.id) ?? []
    if (trades.length > 0 && trades.every(t => t.confirmed)) confirmedRoomIds.push(room.id)
  }

  const suspectTradeIds = []
  for (const roomId of confirmedRoomIds) {
    for (const t of tradesByRoom.get(roomId) ?? []) {
      if (suspectSet.has(t.userId)) suspectTradeIds.push(t.id)
    }
  }

  const tradeRoomCtoons = suspectTradeIds.length
    ? await prisma.tradeCtoon.findMany({
        where: { tradeId: { in: suspectTradeIds } },
        select: { userCtoonId: true, userCtoon: { select: { id: true } } }
      })
    : []

  const offersInitBySuspect = await prisma.tradeOffer.findMany({
    where: { status: 'ACCEPTED', initiatorId: { in: suspectIds }, recipientId: targetId },
    select: {
      id: true, pointsOffered: true,
      ctoons: { where: { role: 'OFFERED' }, select: { userCtoonId: true } }
    }
  })

  const offersInitByTarget = await prisma.tradeOffer.findMany({
    where: { status: 'ACCEPTED', initiatorId: targetId, recipientId: { in: suspectIds } },
    select: {
      id: true,
      ctoons: { where: { role: 'REQUESTED' }, select: { userCtoonId: true } }
    }
  })

  const tradeOfferPointsToTarget = offersInitBySuspect.reduce((sum, o) => sum + (o.pointsOffered ?? 0), 0)

  const tradedToTarget = new Map()
  for (const tc of tradeRoomCtoons) tradedToTarget.set(tc.userCtoonId, true)
  for (const offer of offersInitBySuspect) {
    for (const tc of offer.ctoons) tradedToTarget.set(tc.userCtoonId, true)
  }
  for (const offer of offersInitByTarget) {
    for (const tc of offer.ctoons) tradedToTarget.set(tc.userCtoonId, true)
  }

  const allInstanceIds = [...tradedToTarget.keys()]
  const targetCurrentOwned = allInstanceIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: allInstanceIds }, userId: targetId, burnedAt: null },
        select: { id: true, ctoonId: true, mintNumber: true }
      })
    : []

  const suspectWonAuctions = await prisma.auction.findMany({
    where: { creatorId: targetId, status: 'CLOSED', winnerId: { in: suspectIds } },
    select: { id: true, highestBid: true }
  })
  const auctionPointsToTarget = suspectWonAuctions.reduce((sum, a) => sum + (a.highestBid ?? 0), 0)

  // fallback rarity pricing helper (for ctoon point value)
  const FALLBACK_RARITY_PRICES = {
    'Common': 100, 'Uncommon': 200, 'Rare': 400,
    'Very Rare': 750, 'Crazy Rare': 1250,
    'Auction Only': 0, 'Prize Only': 0, 'Code Only': 0,
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
  const rarityDefaults = await loadRarityDefaults()
  function cmartPriceForRarity(rarity) {
    const key = (rarity || '').trim()
    return rarityDefaults[key]?.price ?? FALLBACK_RARITY_PRICES[key] ?? 0
  }
  async function avgAuctionPriceForCtoon(ctoonId) {
    const ucs = await prisma.userCtoon.findMany({ where: { ctoonId }, select: { id: true } })
    const ucIds = ucs.map(u => u.id)
    if (!ucIds.length) return 0
    const agg = await prisma.auction.aggregate({
      where: { userCtoonId: { in: ucIds }, status: 'CLOSED', winnerId: { not: null }, highestBid: { gt: 0 } },
      _avg: { highestBid: true },
    })
    return Math.round(agg._avg.highestBid ?? 0)
  }

  // compute ctoon point value for items no longer owned
  let totalCtoonPointValue = 0
  const ctoonStats = new Map()
  // need rarity info for the instances
  const instanceDetails = allInstanceIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: allInstanceIds } },
        select: { id: true, ctoonId: true, ctoon: { select: { id: true, rarity: true } } }
      })
    : []
  const targetOwnsSet = new Set(targetCurrentOwned.map(u => u.id))
  for (const uc of instanceDetails) {
    if (!uc.ctoon) continue
    if (!ctoonStats.has(uc.ctoonId)) {
      ctoonStats.set(uc.ctoonId, { rarity: uc.ctoon.rarity, instances: [] })
    }
    ctoonStats.get(uc.ctoonId).instances.push(uc.id)
  }
  for (const [ctoonId, stat] of ctoonStats) {
    const notOwnedCount = stat.instances.filter(id => !targetOwnsSet.has(id)).length
    const rarityPx = cmartPriceForRarity(stat.rarity)
    const avgPx = await avgAuctionPriceForCtoon(ctoonId)
    const unitPrice = Math.max(rarityPx, avgPx)
    totalCtoonPointValue += unitPrice * notOwnedCount
  }

  const totalPointsToRemove = totalCtoonPointValue + tradeOfferPointsToTarget + auctionPointsToTarget

  // ── Apply changes ─────────────────────────────────────────────────────────

  const errors = []
  let pointsRemoved = 0
  let ctoonsTransferred = 0

  // Step 1: Points transfer (target → CartoonReOrbitOfficial)
  if (totalPointsToRemove > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        const targetPts = await tx.userPoints.upsert({
          where: { userId: targetId },
          update: { points: { decrement: totalPointsToRemove } },
          create: { userId: targetId, points: -totalPointsToRemove }
        })
        await tx.pointsLog.create({
          data: {
            userId: targetId,
            direction: 'decrease',
            points: totalPointsToRemove,
            total: targetPts.points,
            method: 'TRADE_AUDIT_REVOKE'
          }
        })

        const officialPts = await tx.userPoints.upsert({
          where: { userId: officialId },
          update: { points: { increment: totalPointsToRemove } },
          create: { userId: officialId, points: totalPointsToRemove }
        })
        await tx.pointsLog.create({
          data: {
            userId: officialId,
            direction: 'increase',
            points: totalPointsToRemove,
            total: officialPts.points,
            method: 'TRADE_AUDIT_REVOKE'
          }
        })
      })
      pointsRemoved = totalPointsToRemove
    } catch (e) {
      errors.push({ phase: 'points', message: String(e?.message || e) })
    }
  }

  // Step 2: Transfer cToons target still owns → CartoonReOrbitOfficial
  for (const uc of targetCurrentOwned) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.userCtoon.update({
          where: { id: uc.id },
          data: { userId: officialId, isTradeable: false }
        })

        await tx.userTradeListItem.deleteMany({
          where: { userCtoonId: uc.id, userId: { not: officialId } }
        })

        await tx.ctoonOwnerLog.create({
          data: {
            userId: officialId,
            ctoonId: uc.ctoonId,
            userCtoonId: uc.id,
            mintNumber: uc.mintNumber ?? null
          }
        })
      })
      ctoonsTransferred++
    } catch (e) {
      errors.push({ phase: 'transfer', userCtoonId: uc.id, message: String(e?.message || e) })
    }
  }

  return {
    target,
    suspects,
    pointsRemoved,
    ctoonsTransferred,
    totalAttempted: targetCurrentOwned.length,
    errors,
    hasErrors: errors.length > 0,
  }
})

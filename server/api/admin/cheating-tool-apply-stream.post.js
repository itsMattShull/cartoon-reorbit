import { defineEventHandler, readBody, getRequestHeader, createError, createEventStream } from 'h3'
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

function cmartPriceForRarity(rarity, rarityDefaults) {
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

export default defineEventHandler(async (event) => {
  // Auth — must happen before the stream starts so errors return normally
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

  // Open the SSE stream
  const stream = createEventStream(event)

  const push = (obj) => stream.push(JSON.stringify(obj))

  ;(async () => {
    try {
      // ── 1. Resolve users ────────────────────────────────────────────────
      const users = await prisma.user.findMany({
        where: { username: { in: [target, 'CartoonReOrbitOfficial', ...suspects] } },
        select: { id: true, username: true }
      })
      const idByName = new Map(users.map(u => [u.username, u.id]))
      const missing = [target, 'CartoonReOrbitOfficial', ...suspects].filter(n => !idByName.has(n))
      if (missing.length) {
        await push({ type: 'error', message: `Unknown username(s): ${missing.join(', ')}` })
        await stream.close()
        return
      }

      const targetId   = idByName.get(target)
      const officialId = idByName.get('CartoonReOrbitOfficial')
      const suspectIds = suspects.map(n => idByName.get(n))
      const suspectSet = new Set(suspectIds)

      // ── 2. Re-derive trade data (same logic as report endpoint) ─────────
      const tradeRooms = await prisma.tradeRoom.findMany({
        where: {
          OR: [
            { traderAId: targetId,          traderBId: { in: suspectIds } },
            { traderAId: { in: suspectIds }, traderBId: targetId },
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
            select: { userCtoonId: true }
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

      // cToons target currently holds from the traded set
      const targetCurrentOwned = allInstanceIds.length
        ? await prisma.userCtoon.findMany({
            where: { id: { in: allInstanceIds }, userId: targetId, burnedAt: null },
            select: {
              id: true, ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
            }
          })
        : []

      // Points to remove
      const suspectWonAuctions = await prisma.auction.findMany({
        where: { creatorId: targetId, status: 'CLOSED', winnerId: { in: suspectIds } },
        select: { id: true, highestBid: true }
      })
      const auctionPointsToTarget = suspectWonAuctions.reduce((sum, a) => sum + (a.highestBid ?? 0), 0)

      // Compute ctoon point value (items no longer owned)
      const rarityDefaults = await loadRarityDefaults()
      const targetOwnsSet = new Set(targetCurrentOwned.map(u => u.id))
      const instanceDetails = allInstanceIds.length
        ? await prisma.userCtoon.findMany({
            where: { id: { in: allInstanceIds } },
            select: { id: true, ctoonId: true, ctoon: { select: { rarity: true } } }
          })
        : []

      const ctoonStats = new Map()
      for (const uc of instanceDetails) {
        if (!uc.ctoon) continue
        if (!ctoonStats.has(uc.ctoonId)) ctoonStats.set(uc.ctoonId, { rarity: uc.ctoon.rarity, instances: [] })
        ctoonStats.get(uc.ctoonId).instances.push(uc.id)
      }

      let totalCtoonPointValue = 0
      for (const [ctoonId, stat] of ctoonStats) {
        const notOwnedCount = stat.instances.filter(id => !targetOwnsSet.has(id)).length
        const rarityPx = cmartPriceForRarity(stat.rarity, rarityDefaults)
        const avgPx = await avgAuctionPriceForCtoon(ctoonId)
        totalCtoonPointValue += Math.max(rarityPx, avgPx) * notOwnedCount
      }

      const totalPointsToRemove = totalCtoonPointValue + tradeOfferPointsToTarget + auctionPointsToTarget

      // ── 3. Send "start" so the UI can set up the progress bar ───────────
      // Total steps = 1 (points) + N (cToons)
      const totalSteps = 1 + targetCurrentOwned.length
      await push({ type: 'start', totalSteps, totalPointsToRemove, ctoonsTotal: targetCurrentOwned.length })

      // ── 4. Transfer points ───────────────────────────────────────────────
      let pointsRemoved = 0
      let pointsError = null
      if (totalPointsToRemove > 0) {
        try {
          await prisma.$transaction(async (tx) => {
            const targetPts = await tx.userPoints.upsert({
              where: { userId: targetId },
              update: { points: { decrement: totalPointsToRemove } },
              create: { userId: targetId, points: -totalPointsToRemove }
            })
            await tx.pointsLog.create({
              data: { userId: targetId, direction: 'decrease', points: totalPointsToRemove, total: targetPts.points, method: 'TRADE_AUDIT_REVOKE' }
            })
            const officialPts = await tx.userPoints.upsert({
              where: { userId: officialId },
              update: { points: { increment: totalPointsToRemove } },
              create: { userId: officialId, points: totalPointsToRemove }
            })
            await tx.pointsLog.create({
              data: { userId: officialId, direction: 'increase', points: totalPointsToRemove, total: officialPts.points, method: 'TRADE_AUDIT_REVOKE' }
            })
          })
          pointsRemoved = totalPointsToRemove
          await push({ type: 'step', phase: 'points', success: true, pointsRemoved })
        } catch (e) {
          pointsError = String(e?.message || e)
          await push({ type: 'step', phase: 'points', success: false, error: pointsError })
        }
      } else {
        await push({ type: 'step', phase: 'points', success: true, pointsRemoved: 0, skipped: true })
      }

      // ── 5. Transfer each cToon ───────────────────────────────────────────
      let ctoonsTransferred = 0
      const ctoonErrors = []

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
              data: { userId: officialId, ctoonId: uc.ctoonId, userCtoonId: uc.id, mintNumber: uc.mintNumber ?? null }
            })
          })
          ctoonsTransferred++
          await push({
            type: 'step',
            phase: 'ctoon',
            success: true,
            userCtoonId: uc.id,
            name: uc.ctoon?.name ?? 'cToon',
            rarity: uc.ctoon?.rarity ?? '',
            mintNumber: uc.mintNumber,
          })
        } catch (e) {
          const msg = String(e?.message || e)
          ctoonErrors.push({ userCtoonId: uc.id, message: msg })
          await push({
            type: 'step',
            phase: 'ctoon',
            success: false,
            userCtoonId: uc.id,
            name: uc.ctoon?.name ?? 'cToon',
            error: msg,
          })
        }
      }

      // ── 6. Final summary ─────────────────────────────────────────────────
      await push({
        type: 'complete',
        pointsRemoved,
        ctoonsTransferred,
        totalAttempted: targetCurrentOwned.length,
        hasErrors: !!pointsError || ctoonErrors.length > 0,
        errors: [
          ...(pointsError ? [{ phase: 'points', message: pointsError }] : []),
          ...ctoonErrors.map(e => ({ phase: 'ctoon', userCtoonId: e.userCtoonId, message: e.message })),
        ],
      })
    } catch (e) {
      try { await push({ type: 'error', message: String(e?.message || e) }) } catch {}
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 86400 // 24 hours

const FALLBACK_PACK_PRICE = 1500

const HARDCODED_RARITY_PRICES = {
  'Common': 100, 'Uncommon': 200, 'Rare': 400, 'Very Rare': 750, 'Crazy Rare': 1250
}

function lastMonday(from = new Date()) {
  const d = new Date(from)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay() // 0=Sun ... 6=Sat
  const daysBack = day === 0 ? 13 : day + 6 // go back to the Monday before last
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d
}

function buildHistogram(values, bucketSize) {
  if (!values.length) return []
  const max = Math.max(...values)
  const buckets = []
  for (let lo = 0; lo <= max; lo += bucketSize) {
    const hi = lo + bucketSize
    const label = `${lo}–${hi - 1}`
    const count = values.filter(v => v >= lo && v < hi).length
    buckets.push({ label, count })
  }
  // trim trailing zero buckets
  while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop()
  return buckets
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { weekStart: weekStartParam } = getQuery(event)

  let weekStart
  if (weekStartParam) {
    weekStart = new Date(`${weekStartParam}T00:00:00.000Z`)
    if (isNaN(weekStart.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid weekStart date' })
    }
  } else {
    weekStart = lastMonday()
  }

  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

  // ── Cache check ───────────────────────────────────────────────────────────
  const weekKey = weekStart.toISOString().slice(0, 10)
  const cacheKey = `admin:collection-analytics:${weekKey}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  const TRACKED_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']

  // ── 1. Weekly cToons ─────────────────────────────────────────────────────
  const weeklyCtoons = await prisma.ctoon.findMany({
    where: {
      releaseDate: { gte: weekStart, lt: weekEnd },
      set: { not: null },
      rarity: { in: TRACKED_RARITIES }
    },
    select: { id: true, set: true, name: true, price: true, rarity: true }
  })

  async function cacheAndReturn(result) {
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
    return result
  }

  if (weeklyCtoons.length === 0) {
    return cacheAndReturn({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      sets: [],
      oneSet: { count: 0, users: [] },
      allSets: { count: 0, users: [] },
      oneSetPointsDistribution: [],
      allSetsPointsDistribution: []
    })
  }

  // Group by set name; build rarity lookup for fallback pricing
  const setMap = new Map() // setName → [{ id, name, price, rarity }]
  const ctoonRarityMap = new Map() // ctoonId → rarity
  for (const c of weeklyCtoons) {
    if (!setMap.has(c.set)) setMap.set(c.set, [])
    setMap.get(c.set).push(c)
    ctoonRarityMap.set(c.id, c.rarity)
  }
  const setNames = [...setMap.keys()]
  const allWeeklyCtoonIds = weeklyCtoons.map(c => c.id)

  // ── 2. Who owns which weekly cToons ──────────────────────────────────────
  const ownedRows = await prisma.userCtoon.findMany({
    where: {
      ctoonId: { in: allWeeklyCtoonIds },
      burnedAt: null
    },
    select: {
      id: true,
      userId: true,
      ctoonId: true,
      userPackId: true,
      pricePaid: true,
      user: { select: { username: true } }
    }
  })

  // userId → { username, ownedCtoonIds: Set, userCtoonByCtoonId: Map<ctoonId, ucId> }
  const userMap = new Map()
  // ucId → { userPackId, pricePaid }
  const ucDetails = new Map()

  for (const row of ownedRows) {
    if (!userMap.has(row.userId)) {
      userMap.set(row.userId, {
        username: row.user?.username || row.userId,
        ownedCtoonIds: new Set(),
        userCtoonByCtoonId: new Map()
      })
    }
    const u = userMap.get(row.userId)
    if (!u.ownedCtoonIds.has(row.ctoonId)) {
      u.ownedCtoonIds.add(row.ctoonId)
      u.userCtoonByCtoonId.set(row.ctoonId, row.id) // first uc per ctoon
    }
    ucDetails.set(row.id, { userPackId: row.userPackId, pricePaid: row.pricePaid })
  }

  // ── 3. Determine completers ───────────────────────────────────────────────
  const oneSetCompleterIds = []
  const allSetsCompleterIds = []
  const userCompletedSetsMap = new Map() // userId → string[]

  for (const [userId, info] of userMap) {
    const completed = []
    for (const [setName, ctoons] of setMap) {
      if (ctoons.every(c => info.ownedCtoonIds.has(c.id))) {
        completed.push(setName)
      }
    }
    if (completed.length > 0) {
      oneSetCompleterIds.push(userId)
      userCompletedSetsMap.set(userId, completed)
    }
    if (completed.length === setNames.length) {
      allSetsCompleterIds.push(userId)
    }
  }

  if (oneSetCompleterIds.length === 0) {
    return cacheAndReturn({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      sets: setNames.map(n => ({ name: n, ctoonCount: setMap.get(n).length })),
      oneSet: { count: 0, users: [] },
      allSets: { count: 0, users: [] },
      oneSetPointsDistribution: [],
      allSetsPointsDistribution: []
    })
  }

  // ── 4. Collect all relevant userCtoon IDs for completers ──────────────────
  const completerUcIds = []
  const ucIdToUserCtoon = new Map() // ucId → { userId, ctoonId }

  for (const userId of oneSetCompleterIds) {
    const info = userMap.get(userId)
    const completedSets = userCompletedSetsMap.get(userId)
    const completedCtoonIds = new Set(
      completedSets.flatMap(s => setMap.get(s).map(c => c.id))
    )
    for (const [ctoonId, ucId] of info.userCtoonByCtoonId) {
      if (completedCtoonIds.has(ctoonId)) {
        completerUcIds.push(ucId)
        ucIdToUserCtoon.set(ucId, { userId, ctoonId })
      }
    }
  }

  // ── 5. Attribution: CtoonOwnerLog (detect transfers vs direct mint) ───────
  const ownerLogs = await prisma.ctoonOwnerLog.findMany({
    where: { userCtoonId: { in: completerUcIds } },
    select: { userCtoonId: true, userId: true }
  })
  const transferredUcIds = new Set(ownerLogs.map(l => l.userCtoonId))

  // ── 6. Attribution: Auction wins ──────────────────────────────────────────
  const auctionWins = await prisma.auction.findMany({
    where: {
      winnerId: { in: oneSetCompleterIds },
      status: 'CLOSED',
      userCtoonId: { in: completerUcIds }
    },
    select: {
      winnerId: true,
      userCtoonId: true,
      highestBid: true
    }
  })
  const auctionByUcId = new Map()
  for (const a of auctionWins) {
    auctionByUcId.set(a.userCtoonId, { bid: a.highestBid, winnerId: a.winnerId })
  }

  // ── 7. Attribution: Accepted trades ──────────────────────────────────────
  const acceptedTrades = await prisma.tradeOffer.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { recipientId: { in: oneSetCompleterIds } },
        { initiatorId: { in: oneSetCompleterIds } }
      ]
    },
    select: {
      id: true,
      initiatorId: true,
      recipientId: true,
      pointsOffered: true,
      ctoons: {
        select: {
          role: true,
          userCtoonId: true,
          userCtoon: { select: { ctoonId: true } }
        }
      }
    }
  })

  const tradeCountByUser = new Map()
  const tradePointsByUser = new Map()

  for (const offer of acceptedTrades) {
    const offeredSetCtoons = offer.ctoons.filter(
      tc => tc.role === 'OFFERED' && allWeeklyCtoonIds.includes(tc.userCtoon?.ctoonId)
    )
    const requestedSetCtoons = offer.ctoons.filter(
      tc => tc.role === 'REQUESTED' && allWeeklyCtoonIds.includes(tc.userCtoon?.ctoonId)
    )

    if (offeredSetCtoons.length > 0 && oneSetCompleterIds.includes(offer.recipientId)) {
      tradeCountByUser.set(offer.recipientId, (tradeCountByUser.get(offer.recipientId) || 0) + 1)
    }

    if (requestedSetCtoons.length > 0 && oneSetCompleterIds.includes(offer.initiatorId)) {
      tradeCountByUser.set(offer.initiatorId, (tradeCountByUser.get(offer.initiatorId) || 0) + 1)
      if (offer.pointsOffered > 0) {
        tradePointsByUser.set(
          offer.initiatorId,
          (tradePointsByUser.get(offer.initiatorId) || 0) + offer.pointsOffered
        )
      }
    }
  }

  // ── 8. Fetch rarity fallback prices from GlobalGameConfig ─────────────────
  let rarityPrices = { ...HARDCODED_RARITY_PRICES }
  try {
    const cfg = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { rarityDefaults: true }
    })
    if (cfg?.rarityDefaults) {
      for (const [rarity, vals] of Object.entries(cfg.rarityDefaults)) {
        if (vals?.price != null) rarityPrices[rarity] = vals.price
      }
    }
  } catch {}

  // ── 9. Fetch UserPack prices for pack-acquired set cToons ─────────────────
  const packIdSet = new Set()
  for (const ucId of completerUcIds) {
    const uc = ucDetails.get(ucId)
    if (uc?.userPackId) packIdSet.add(uc.userPackId)
  }
  const packPriceMap = new Map() // userPackId → pricePaid (Int | null)
  if (packIdSet.size > 0) {
    const userPacks = await prisma.userPack.findMany({
      where: { id: { in: [...packIdSet] } },
      select: { id: true, pricePaid: true }
    })
    for (const up of userPacks) {
      packPriceMap.set(up.id, up.pricePaid)
    }
  }

  // ── 10. Compute per-user totals ───────────────────────────────────────────
  // pointsSpent sources (in priority order):
  //   auction bid (exact) > direct cmart pricePaid (exact) > pack pricePaid (exact, deduplicated)
  //   > rarity default fallback for direct (estimated*) > 1500 fallback for pack (estimated*)
  //   trade points offered are added separately
  const userTotals = new Map() // userId → { points, trades, auctions, isEstimated }

  for (const userId of oneSetCompleterIds) {
    const info = userMap.get(userId)
    const completedSets = userCompletedSetsMap.get(userId)
    const completedCtoonIds = new Set(
      completedSets.flatMap(s => setMap.get(s).map(c => c.id))
    )

    let points = tradePointsByUser.get(userId) || 0
    let auctions = 0
    let isEstimated = false
    // Track which packs have already been counted to avoid double-counting
    // when multiple set cToons came from the same pack opening.
    const packsAccounted = new Set()

    for (const [ctoonId, ucId] of info.userCtoonByCtoonId) {
      if (!completedCtoonIds.has(ctoonId)) continue

      const auctionInfo = auctionByUcId.get(ucId)
      if (auctionInfo && auctionInfo.winnerId === userId) {
        points += auctionInfo.bid
        auctions += 1
      } else if (!transferredUcIds.has(ucId)) {
        const uc = ucDetails.get(ucId)
        if (uc?.userPackId) {
          // Pack-acquired — count each pack's cost once even if it yielded multiple set cToons
          if (!packsAccounted.has(uc.userPackId)) {
            packsAccounted.add(uc.userPackId)
            const packPricePaid = packPriceMap.get(uc.userPackId)
            if (packPricePaid != null) {
              points += packPricePaid
            } else {
              points += FALLBACK_PACK_PRICE
              isEstimated = true
            }
          }
        } else {
          // Direct cmart purchase
          if (uc?.pricePaid != null) {
            points += uc.pricePaid
          } else {
            // Legacy record: fall back to rarity default price
            const rarity = ctoonRarityMap.get(ctoonId)
            points += rarityPrices[rarity] ?? 0
            isEstimated = true
          }
        }
      }
      // transferred (trade / wishlist / lottery) → 0 additional points, counted in trades
    }

    userTotals.set(userId, {
      points,
      trades: tradeCountByUser.get(userId) || 0,
      auctions,
      isEstimated
    })
  }

  // ── 11. Build response arrays ─────────────────────────────────────────────
  function buildUserList(ids) {
    return ids.map(userId => {
      const info = userMap.get(userId)
      const totals = userTotals.get(userId)
      return {
        userId,
        username: info.username,
        completedSets: userCompletedSetsMap.get(userId),
        pointsSpent: totals.points,
        pointsEstimated: totals.isEstimated,
        tradesUsed: totals.trades,
        auctionsWon: totals.auctions
      }
    }).sort((a, b) => a.pointsSpent - b.pointsSpent)
  }

  const oneSetUsers = buildUserList(oneSetCompleterIds)
  const allSetsUsers = buildUserList(allSetsCompleterIds)

  // Histogram bucket size: auto-scale to ~10 meaningful buckets
  function chooseBucketSize(values) {
    if (!values.length) return 100
    const max = Math.max(...values)
    if (max === 0) return 100
    const raw = max / 10
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
    const normalized = raw / magnitude
    let nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
    return Math.max(1, nice * magnitude)
  }

  const oneSetPoints = oneSetUsers.map(u => u.pointsSpent)
  const allSetsPoints = allSetsUsers.map(u => u.pointsSpent)

  return cacheAndReturn({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    sets: setNames.map(n => ({ name: n, ctoonCount: setMap.get(n).length })),
    oneSet: {
      count: oneSetUsers.length,
      users: oneSetUsers
    },
    allSets: {
      count: allSetsUsers.length,
      users: allSetsUsers
    },
    oneSetPointsDistribution: buildHistogram(oneSetPoints, chooseBucketSize(oneSetPoints)),
    allSetsPointsDistribution: buildHistogram(allSetsPoints, chooseBucketSize(allSetsPoints))
  })
})

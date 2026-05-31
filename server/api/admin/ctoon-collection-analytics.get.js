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

  const { weekStart: weekStartParam, refresh } = getQuery(event)

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
  const cacheKey = `admin:collection-analytics:v2:${weekKey}`
  if (!refresh) {
    try {
      const hit = await redis.get(cacheKey)
      if (hit) return JSON.parse(hit)
    } catch {}
  }

  const TRACKED_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']

  // ── 1. cToons whose set released in the selected week ────────────────────
  // Week selection determines WHICH SETS to analyze; all acquisition data is all-time.
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

  const emptyBreakdown = {
    totalPoints: 0, totalTrades: 0, totalAuctions: 0,
    totalCmartCount: 0, totalCmartPoints: 0,
    totalPackCount: 0, totalPackPoints: 0,
    totalFailedPackCount: 0, totalFailedPackPoints: 0
  }

  if (weeklyCtoons.length === 0) {
    return cacheAndReturn({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      sets: [],
      oneSet: { count: 0, users: [], breakdown: { ...emptyBreakdown } },
      allSets: { count: 0, users: [], breakdown: { ...emptyBreakdown } },
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

  // ── 2. All-time ownership of weekly cToons ───────────────────────────────
  // Ordered by createdAt asc so the first row per (userId, ctoonId) is the earliest acquisition.
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
      createdAt: true,
      user: { select: { username: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  // userId → { username, ownedCtoonIds: Set, firstAcquisitions: Map<ctoonId, { ucId, createdAt }> }
  const userMap = new Map()
  // ucId → { userPackId, pricePaid }
  const ucDetails = new Map()

  for (const row of ownedRows) {
    if (!userMap.has(row.userId)) {
      userMap.set(row.userId, {
        username: row.user?.username || row.userId,
        ownedCtoonIds: new Set(),
        firstAcquisitions: new Map()
      })
    }
    const u = userMap.get(row.userId)
    if (!u.ownedCtoonIds.has(row.ctoonId)) {
      u.ownedCtoonIds.add(row.ctoonId)
      // First row encountered (earliest createdAt) is the canonical first acquisition
      u.firstAcquisitions.set(row.ctoonId, { ucId: row.id, createdAt: row.createdAt })
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
      oneSet: { count: 0, users: [], breakdown: { ...emptyBreakdown } },
      allSets: { count: 0, users: [], breakdown: { ...emptyBreakdown } },
      oneSetPointsDistribution: [],
      allSetsPointsDistribution: []
    })
  }

  // ── 4. Collect first-acquisition UC IDs for completers ───────────────────
  const completerUcIds = []
  const ucIdToUserCtoon = new Map() // ucId → { userId, ctoonId }

  for (const userId of oneSetCompleterIds) {
    const info = userMap.get(userId)
    const completedSets = userCompletedSetsMap.get(userId)
    const completedCtoonIds = new Set(
      completedSets.flatMap(s => setMap.get(s).map(c => c.id))
    )
    for (const [ctoonId, acq] of info.firstAcquisitions) {
      if (completedCtoonIds.has(ctoonId)) {
        completerUcIds.push(acq.ucId)
        ucIdToUserCtoon.set(acq.ucId, { userId, ctoonId })
      }
    }
  }

  // ── 5. Attribution: CtoonOwnerLog (detect transfers vs original acquisition) ──
  const ownerLogs = await prisma.ctoonOwnerLog.findMany({
    where: { userCtoonId: { in: completerUcIds } },
    select: { userCtoonId: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  })
  const originalOwnerByUcId = new Map() // ucId → earliest-log userId
  for (const log of ownerLogs) {
    if (!originalOwnerByUcId.has(log.userCtoonId)) {
      originalOwnerByUcId.set(log.userCtoonId, log.userId)
    }
  }

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
  const packPriceMap = new Map() // userPackId → pricePaid
  if (packIdSet.size > 0) {
    const userPacks = await prisma.userPack.findMany({
      where: { id: { in: [...packIdSet] } },
      select: { id: true, pricePaid: true }
    })
    for (const up of userPacks) {
      packPriceMap.set(up.id, up.pricePaid)
    }
  }

  // ── 10. Find set-eligible packs for "failed pack" tracking ───────────────
  // A pack is "set-eligible" if it could yield cToons from the selected sets.
  // PackCtoonOption reflects the *current* pool and can change as rarities sell out
  // or are rotated, so we use historical evidence as the primary signal: any pack
  // definition that has actually minted a set cToon for any user at any time is
  // definitively eligible. We supplement with the current PackCtoonOption config
  // to catch newly added packs that haven't minted yet.
  const [historicallyEligiblePacks, currentOptionPacks] = await Promise.all([
    prisma.userPack.findMany({
      where: {
        mintedCtoons: { some: { ctoonId: { in: allWeeklyCtoonIds } } }
      },
      select: { packId: true }
    }),
    prisma.packCtoonOption.findMany({
      where: { ctoonId: { in: allWeeklyCtoonIds } },
      select: { packId: true }
    })
  ])
  const eligiblePackDefIds = new Set([
    ...historicallyEligiblePacks.map(up => up.packId),
    ...currentOptionPacks.map(o => o.packId)
  ])
  const eligiblePackIds = [...eligiblePackDefIds]

  // Fetch all set-eligible UserPacks opened by completers (with known open time)
  const eligibleUserPacksRaw = eligiblePackIds.length > 0
    ? await prisma.userPack.findMany({
        where: {
          userId: { in: oneSetCompleterIds },
          packId: { in: eligiblePackIds },
          opened: true,
          openedAt: { not: null }
        },
        select: {
          id: true,
          userId: true,
          packId: true,
          openedAt: true,
          pricePaid: true,
          mintedCtoons: {
            where: { ctoonId: { in: allWeeklyCtoonIds } },
            select: { id: true, ctoonId: true }
          }
        }
      })
    : []

  // Group by userId for efficient per-user lookup
  const eligibleUserPacksByUser = new Map() // userId → UserPack[]
  for (const up of eligibleUserPacksRaw) {
    if (!eligibleUserPacksByUser.has(up.userId)) eligibleUserPacksByUser.set(up.userId, [])
    eligibleUserPacksByUser.get(up.userId).push(up)
  }

  // ── 11. Compute per-user totals ───────────────────────────────────────────
  const userTotals = new Map()

  for (const userId of oneSetCompleterIds) {
    const info = userMap.get(userId)
    const completedSets = userCompletedSetsMap.get(userId)
    const completedCtoonIds = new Set(
      completedSets.flatMap(s => setMap.get(s).map(c => c.id))
    )

    // Determine the cutoff time: when the user finished acquiring all their completed sets.
    // No costs after this point should count.
    let cutoffTime = null
    const firstAcqUcIds = new Set()
    for (const [ctoonId, acq] of info.firstAcquisitions) {
      if (completedCtoonIds.has(ctoonId)) {
        firstAcqUcIds.add(acq.ucId)
        if (!cutoffTime || acq.createdAt > cutoffTime) cutoffTime = acq.createdAt
      }
    }

    let points = tradePointsByUser.get(userId) || 0
    let auctions = 0
    let isEstimated = false
    // Track which packs have already been counted (successful — yielded a first-acq set cToon)
    const packsAccounted = new Set()

    // Breakdown accumulators
    let cmartCount = 0
    let cmartPoints = 0
    let packCount = 0
    let packPoints = 0
    let auctionPoints = 0

    for (const [ctoonId, acq] of info.firstAcquisitions) {
      if (!completedCtoonIds.has(ctoonId)) continue

      const ucId = acq.ucId

      const auctionInfo = auctionByUcId.get(ucId)
      if (auctionInfo && auctionInfo.winnerId === userId) {
        points += auctionInfo.bid
        auctionPoints += auctionInfo.bid
        auctions += 1
        continue
      }

      // Transferred in (trade / wishlist / admin) — no purchase cost for this user
      const originalOwner = originalOwnerByUcId.get(ucId)
      const wasTransferred = originalOwner != null && originalOwner !== userId
      if (wasTransferred) continue

      const uc = ucDetails.get(ucId)
      if (uc?.userPackId) {
        // Pack-acquired — count each pack's cost once even if it yielded multiple set cToons
        if (!packsAccounted.has(uc.userPackId)) {
          packsAccounted.add(uc.userPackId)
          const packPricePaid = packPriceMap.get(uc.userPackId)
          if (packPricePaid != null) {
            points += packPricePaid
            packPoints += packPricePaid
          } else {
            points += FALLBACK_PACK_PRICE
            packPoints += FALLBACK_PACK_PRICE
            isEstimated = true
          }
          packCount += 1
        }
      } else {
        // Direct cMart purchase
        if (uc?.pricePaid != null) {
          points += uc.pricePaid
          cmartPoints += uc.pricePaid
        } else {
          // Legacy record: fall back to rarity default price
          const rarity = ctoonRarityMap.get(ctoonId)
          const fallback = rarityPrices[rarity] ?? 0
          points += fallback
          cmartPoints += fallback
          isEstimated = true
        }
        cmartCount += 1
      }
    }

    // Failed packs: set-eligible packs opened before set completion that yielded
    // no first-acquisition set cToons. These represent real points spent hunting for
    // set cToons even though they came up empty.
    let failedPackCount = 0
    let failedPackPoints = 0

    if (cutoffTime) {
      const userEligiblePacks = eligibleUserPacksByUser.get(userId) || []
      for (const up of userEligiblePacks) {
        // Only count packs opened before the user completed their sets
        if (up.openedAt > cutoffTime) continue
        // Skip packs already counted in the successful-pack path
        if (packsAccounted.has(up.id)) continue

        // A pack is "failed" for this set journey if none of its minted set cToons
        // were a first acquisition for this user
        const hasFirstAcq = up.mintedCtoons.some(mc => firstAcqUcIds.has(mc.id))
        if (hasFirstAcq) continue

        const price = up.pricePaid ?? FALLBACK_PACK_PRICE
        if (up.pricePaid == null) isEstimated = true
        failedPackCount += 1
        failedPackPoints += price
        points += price
        packCount += 1
        packPoints += price
      }
    }

    userTotals.set(userId, {
      points,
      trades: tradeCountByUser.get(userId) || 0,
      auctions,
      isEstimated,
      cmartCount,
      cmartPoints,
      packCount,
      packPoints,
      failedPackCount,
      failedPackPoints,
      auctionPoints
    })
  }

  // ── 12. Build response arrays ─────────────────────────────────────────────
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
        auctionsWon: totals.auctions,
        cmartCount: totals.cmartCount,
        cmartPoints: totals.cmartPoints,
        packCount: totals.packCount,
        packPoints: totals.packPoints,
        failedPackCount: totals.failedPackCount,
        failedPackPoints: totals.failedPackPoints
      }
    }).sort((a, b) => a.pointsSpent - b.pointsSpent)
  }

  function buildBreakdown(users) {
    return users.reduce((acc, u) => ({
      totalPoints: acc.totalPoints + u.pointsSpent,
      totalTrades: acc.totalTrades + u.tradesUsed,
      totalAuctions: acc.totalAuctions + u.auctionsWon,
      totalCmartCount: acc.totalCmartCount + u.cmartCount,
      totalCmartPoints: acc.totalCmartPoints + u.cmartPoints,
      totalPackCount: acc.totalPackCount + u.packCount,
      totalPackPoints: acc.totalPackPoints + u.packPoints,
      totalFailedPackCount: acc.totalFailedPackCount + u.failedPackCount,
      totalFailedPackPoints: acc.totalFailedPackPoints + u.failedPackPoints
    }), { ...emptyBreakdown })
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
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
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
      users: oneSetUsers,
      breakdown: buildBreakdown(oneSetUsers)
    },
    allSets: {
      count: allSetsUsers.length,
      users: allSetsUsers,
      breakdown: buildBreakdown(allSetsUsers)
    },
    oneSetPointsDistribution: buildHistogram(oneSetPoints, chooseBucketSize(oneSetPoints)),
    allSetsPointsDistribution: buildHistogram(allSetsPoints, chooseBucketSize(allSetsPoints))
  })
})

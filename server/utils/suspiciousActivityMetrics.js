/**
 * Suspicious Activity Metrics Utility
 *
 * Provides metric definitions and computation functions for the
 * Suspicious Activity Monitor admin page.
 *
 * Adding a new metric:
 *  1. Add an entry to METRIC_DEFINITIONS
 *  2. Add a case in computeMetricForUsers()
 */

/** Human-readable metadata for every supported metric. */
export const METRIC_DEFINITIONS = {
  // ── Trading ────────────────────────────────────────────────────────────────
  tradeOfferCount: {
    label: 'Trade offers (accepted)',
    description: 'Total number of accepted trade offers the user was involved in (as initiator or recipient)',
    category: 'Trading',
    unit: 'trades',
  },
  tradeOfferPartnerCount: {
    label: 'Unique trade partners',
    description: 'Number of distinct users this user has completed accepted trade offers with',
    category: 'Trading',
    unit: 'users',
  },
  tradeOfferConcentrationPct: {
    label: 'Trade concentration % (top partner)',
    description: 'Percentage of accepted trades conducted with their single most-frequent partner (0–100). High values mean almost all trades go to/from one person.',
    category: 'Trading',
    unit: '%',
  },
  pointsReceivedFromTrades: {
    label: 'Points received via trades',
    description: 'Total points the user received as the recipient in accepted trade offers',
    category: 'Trading',
    unit: 'points',
  },

  // ── Auctions ───────────────────────────────────────────────────────────────
  auctionWinCount: {
    label: 'Auctions won',
    description: 'Number of auctions this user won (status = CLOSED, user is winnerId)',
    category: 'Auctions',
    unit: 'auctions',
  },
  auctionWinSellerCount: {
    label: 'Unique sellers won from',
    description: 'Number of distinct users whose auctions this user has won',
    category: 'Auctions',
    unit: 'users',
  },
  auctionWinConcentrationPct: {
    label: 'Auction-win concentration % (top seller)',
    description: 'Percentage of auction wins that came from a single seller. High values mean wins are concentrated on one seller.',
    category: 'Auctions',
    unit: '%',
  },
  auctionUniqueBiddersCount: {
    label: 'Unique bidders on own auctions',
    description: 'Number of distinct users who have bid on auctions this user created',
    category: 'Auctions',
    unit: 'users',
  },
  auctionBidOnSellerCount: {
    label: 'Unique sellers bid on',
    description: 'Number of distinct auction creators this user has placed bids on',
    category: 'Auctions',
    unit: 'users',
  },

  // ── IP / Account ───────────────────────────────────────────────────────────
  sharedIPUserCount: {
    label: 'Accounts sharing an IP',
    description: 'Number of other user accounts that share at least one recorded IP address with this user',
    category: 'IP / Account',
    unit: 'users',
  },
}

/** Operator evaluation helper */
function evalOperator(value, operator, threshold) {
  switch (operator) {
    case 'gt':  return value >  threshold
    case 'gte': return value >= threshold
    case 'lt':  return value <  threshold
    case 'lte': return value <= threshold
    case 'eq':  return value === threshold
    default:    return false
  }
}

/** Human-readable operator labels for display. */
export const OPERATOR_LABELS = {
  gt:  'is greater than',
  gte: 'is greater than or equal to',
  lt:  'is less than',
  lte: 'is less than or equal to',
  eq:  'equals',
}

/**
 * Compute every requested metric for every user who has any relevant activity
 * within the optional time window.
 *
 * Returns a Map<userId, { [metricKey]: number }>
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Set<string>} metricKeys   - which metrics to compute
 * @param {Date|null}   sinceDate    - only consider activity on/after this date (null = all time)
 */
async function computeAllUserMetrics(prisma, metricKeys, sinceDate) {
  /** @type {Map<string, Record<string, number>>} */
  const results = new Map()

  function ensure(userId) {
    if (!results.has(userId)) results.set(userId, {})
    return results.get(userId)
  }

  const dateFilter = sinceDate ? { gte: sinceDate } : undefined

  // ── Trade metrics ──────────────────────────────────────────────────────────
  const needsTrade = metricKeys.has('tradeOfferCount') ||
                     metricKeys.has('tradeOfferPartnerCount') ||
                     metricKeys.has('tradeOfferConcentrationPct') ||
                     metricKeys.has('pointsReceivedFromTrades')

  if (needsTrade) {
    const offers = await prisma.tradeOffer.findMany({
      where: {
        status: 'ACCEPTED',
        ...(dateFilter ? { updatedAt: dateFilter } : {}),
      },
      select: {
        initiatorId: true,
        recipientId: true,
        pointsOffered: true,
      },
    })

    // Build per-user partner maps: userId → Map<partnerId, count>
    const partnerCounts = new Map() // userId → Map<partnerId, tradeCount>
    const tradeTotal    = new Map() // userId → total trades
    const pointsRx      = new Map() // userId → points received as recipient

    for (const offer of offers) {
      const { initiatorId, recipientId, pointsOffered } = offer

      // initiator side
      if (!partnerCounts.has(initiatorId)) partnerCounts.set(initiatorId, new Map())
      const iMap = partnerCounts.get(initiatorId)
      iMap.set(recipientId, (iMap.get(recipientId) ?? 0) + 1)
      tradeTotal.set(initiatorId, (tradeTotal.get(initiatorId) ?? 0) + 1)

      // recipient side
      if (!partnerCounts.has(recipientId)) partnerCounts.set(recipientId, new Map())
      const rMap = partnerCounts.get(recipientId)
      rMap.set(initiatorId, (rMap.get(initiatorId) ?? 0) + 1)
      tradeTotal.set(recipientId, (tradeTotal.get(recipientId) ?? 0) + 1)

      // points received by recipient
      if (pointsOffered > 0) {
        pointsRx.set(recipientId, (pointsRx.get(recipientId) ?? 0) + pointsOffered)
      }
    }

    for (const [userId, pMap] of partnerCounts) {
      const rec = ensure(userId)
      const total = tradeTotal.get(userId) ?? 0
      const partnerCount = pMap.size
      const maxWithOne = Math.max(...pMap.values(), 0)
      const concentrationPct = total > 0 ? Math.round((maxWithOne / total) * 100 * 10) / 10 : 0

      if (metricKeys.has('tradeOfferCount'))           rec.tradeOfferCount = total
      if (metricKeys.has('tradeOfferPartnerCount'))    rec.tradeOfferPartnerCount = partnerCount
      if (metricKeys.has('tradeOfferConcentrationPct')) rec.tradeOfferConcentrationPct = concentrationPct
    }

    if (metricKeys.has('pointsReceivedFromTrades')) {
      for (const [userId, pts] of pointsRx) {
        ensure(userId).pointsReceivedFromTrades = pts
      }
    }
  }

  // ── Auction win metrics ────────────────────────────────────────────────────
  const needsWins = metricKeys.has('auctionWinCount') ||
                    metricKeys.has('auctionWinSellerCount') ||
                    metricKeys.has('auctionWinConcentrationPct')

  if (needsWins) {
    const wins = await prisma.auction.findMany({
      where: {
        status: 'CLOSED',
        winnerId: { not: null },
        ...(dateFilter ? { winnerAt: dateFilter } : {}),
      },
      select: {
        winnerId: true,
        creatorId: true,
      },
    })

    // winnerId → Map<sellerId, winCount>
    const winnerSellerMap = new Map()

    for (const { winnerId, creatorId } of wins) {
      if (!winnerId) continue
      if (!winnerSellerMap.has(winnerId)) winnerSellerMap.set(winnerId, new Map())
      const sMap = winnerSellerMap.get(winnerId)
      const seller = creatorId ?? '__unknown__'
      sMap.set(seller, (sMap.get(seller) ?? 0) + 1)
    }

    for (const [userId, sMap] of winnerSellerMap) {
      const rec = ensure(userId)
      const total = [...sMap.values()].reduce((a, b) => a + b, 0)
      const sellerCount = sMap.size
      const maxFromOne = Math.max(...sMap.values(), 0)
      const concentrationPct = total > 0 ? Math.round((maxFromOne / total) * 100 * 10) / 10 : 0

      if (metricKeys.has('auctionWinCount'))           rec.auctionWinCount = total
      if (metricKeys.has('auctionWinSellerCount'))     rec.auctionWinSellerCount = sellerCount
      if (metricKeys.has('auctionWinConcentrationPct')) rec.auctionWinConcentrationPct = concentrationPct
    }
  }

  // ── Unique bidders on own auctions ─────────────────────────────────────────
  if (metricKeys.has('auctionUniqueBiddersCount')) {
    const myAuctions = await prisma.auction.findMany({
      where: {
        creatorId: { not: null },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        creatorId: true,
        bids: { select: { userId: true } },
      },
    })

    // creatorId → Set<bidderId>
    const creatorBidders = new Map()
    for (const auction of myAuctions) {
      if (!auction.creatorId) continue
      if (!creatorBidders.has(auction.creatorId)) creatorBidders.set(auction.creatorId, new Set())
      const bSet = creatorBidders.get(auction.creatorId)
      for (const bid of auction.bids) bSet.add(bid.userId)
    }

    for (const [userId, bSet] of creatorBidders) {
      ensure(userId).auctionUniqueBiddersCount = bSet.size
    }
  }

  // ── Unique sellers bid on ──────────────────────────────────────────────────
  if (metricKeys.has('auctionBidOnSellerCount')) {
    const bids = await prisma.bid.findMany({
      where: {
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: {
        userId: true,
        auction: { select: { creatorId: true } },
      },
    })

    // bidderId → Set<sellerId>
    const bidderSellers = new Map()
    for (const bid of bids) {
      const sellerId = bid.auction?.creatorId
      if (!sellerId || sellerId === bid.userId) continue // skip self
      if (!bidderSellers.has(bid.userId)) bidderSellers.set(bid.userId, new Set())
      bidderSellers.get(bid.userId).add(sellerId)
    }

    for (const [userId, sSet] of bidderSellers) {
      ensure(userId).auctionBidOnSellerCount = sSet.size
    }
  }

  // ── Shared IP user count ───────────────────────────────────────────────────
  if (metricKeys.has('sharedIPUserCount')) {
    // Get all userIP records
    const allIPs = await prisma.userIP.findMany({
      select: { userId: true, ip: true },
    })

    // ip → Set<userId>
    const ipUsers = new Map()
    for (const { userId, ip } of allIPs) {
      if (!ipUsers.has(ip)) ipUsers.set(ip, new Set())
      ipUsers.get(ip).add(userId)
    }

    // For each user, find all other users sharing any of their IPs
    // userId → Set<userId>
    const userSharedWith = new Map()

    for (const { userId, ip } of allIPs) {
      const others = ipUsers.get(ip)
      if (!others || others.size <= 1) continue
      if (!userSharedWith.has(userId)) userSharedWith.set(userId, new Set())
      for (const otherId of others) {
        if (otherId !== userId) userSharedWith.get(userId).add(otherId)
      }
    }

    for (const [userId, otherSet] of userSharedWith) {
      ensure(userId).sharedIPUserCount = otherSet.size
    }
  }

  return results
}

/**
 * Collect all context data needed to explain why a user was flagged.
 * Returns top trade partners, top auction sellers, and shared IP accounts.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} userIds
 * @param {Date|null} sinceDate
 */
async function buildContextForUsers(prisma, userIds, sinceDate) {
  if (userIds.length === 0) return {}

  const dateFilter = sinceDate ? { gte: sinceDate } : undefined
  const context = {}
  for (const id of userIds) context[id] = { topTradePartners: [], topAuctionSellers: [], sharedIPUsers: [] }

  // ── Trade partners ─────────────────────────────────────────────────────────
  const offers = await prisma.tradeOffer.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ initiatorId: { in: userIds } }, { recipientId: { in: userIds } }],
      ...(dateFilter ? { updatedAt: dateFilter } : {}),
    },
    select: {
      initiatorId: true,
      recipientId: true,
      initiator: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
    },
  })

  // userId → Map<partnerId, { user, count }>
  const tradeMap = new Map()
  for (const id of userIds) tradeMap.set(id, new Map())

  for (const offer of offers) {
    const { initiatorId, recipientId, initiator, recipient } = offer
    if (tradeMap.has(initiatorId)) {
      const m = tradeMap.get(initiatorId)
      if (!m.has(recipientId)) m.set(recipientId, { user: recipient, count: 0 })
      m.get(recipientId).count++
    }
    if (tradeMap.has(recipientId)) {
      const m = tradeMap.get(recipientId)
      if (!m.has(initiatorId)) m.set(initiatorId, { user: initiator, count: 0 })
      m.get(initiatorId).count++
    }
  }

  for (const [userId, partnerMap] of tradeMap) {
    const sorted = [...partnerMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ user, count }) => ({ userId: user.id, username: user.username, tradeCount: count }))
    context[userId].topTradePartners = sorted
  }

  // ── Top auction sellers ────────────────────────────────────────────────────
  const wins = await prisma.auction.findMany({
    where: {
      status: 'CLOSED',
      winnerId: { in: userIds },
      ...(dateFilter ? { winnerAt: dateFilter } : {}),
    },
    select: {
      winnerId: true,
      creatorId: true,
      creator: { select: { id: true, username: true } },
    },
  })

  // userId → Map<sellerId, { user, wins }>
  const auctionMap = new Map()
  for (const id of userIds) auctionMap.set(id, new Map())

  for (const win of wins) {
    if (!win.winnerId || !win.creatorId || !auctionMap.has(win.winnerId)) continue
    const m = auctionMap.get(win.winnerId)
    if (!m.has(win.creatorId)) m.set(win.creatorId, { user: win.creator, wins: 0 })
    m.get(win.creatorId).wins++
  }

  for (const [userId, sellerMap] of auctionMap) {
    const sorted = [...sellerMap.values()]
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10)
      .map(({ user, wins }) => ({ userId: user?.id, username: user?.username, wins }))
    context[userId].topAuctionSellers = sorted
  }

  // ── Shared IP users ────────────────────────────────────────────────────────
  const myIPs = await prisma.userIP.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, ip: true },
  })

  // Build: ip → Set<userId> for all IPs relevant to flagged users
  const relevantIPs = [...new Set(myIPs.map(r => r.ip))]

  if (relevantIPs.length > 0) {
    const sharedRows = await prisma.userIP.findMany({
      where: { ip: { in: relevantIPs } },
      select: {
        userId: true,
        ip: true,
        user: { select: { id: true, username: true } },
      },
    })

    // ip → [{ userId, username }]
    const ipUserMap = new Map()
    for (const row of sharedRows) {
      if (!ipUserMap.has(row.ip)) ipUserMap.set(row.ip, [])
      ipUserMap.get(row.ip).push({ userId: row.userId, username: row.user.username })
    }

    // For each flagged user, build list of other users per shared IP
    for (const { userId, ip } of myIPs) {
      if (!context[userId]) continue
      const others = (ipUserMap.get(ip) ?? []).filter(u => u.userId !== userId)
      if (others.length === 0) continue

      // Aggregate: otherUserId → { user, ips[] }
      const existing = context[userId].sharedIPUsers
      for (const other of others) {
        const found = existing.find(e => e.userId === other.userId)
        if (found) {
          if (!found.sharedIPs.includes(ip)) found.sharedIPs.push(ip)
        } else {
          existing.push({ userId: other.userId, username: other.username, sharedIPs: [ip] })
        }
      }
    }
  }

  return context
}

/**
 * Evaluate a single rule against all users.
 * Returns array of matching userId strings.
 *
 * @param {Map<string, Record<string, number>>} allMetrics
 * @param {{ conditionLogic: string, conditions: Array<{ metric, operator, threshold }> }} rule
 */
function evaluateRule(allMetrics, rule) {
  const matched = []
  const logic = rule.conditionLogic === 'OR' ? 'OR' : 'AND'

  for (const [userId, metrics] of allMetrics) {
    let passes
    if (logic === 'AND') {
      passes = rule.conditions.every(c => {
        const val = metrics[c.metric] ?? 0
        return evalOperator(val, c.operator, c.threshold)
      })
    } else {
      passes = rule.conditions.some(c => {
        const val = metrics[c.metric] ?? 0
        return evalOperator(val, c.operator, c.threshold)
      })
    }
    if (passes) matched.push(userId)
  }

  return matched
}

/**
 * Run all active rules and return flagged users with metrics and context.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array} rules - SuspiciousActivityRule rows with conditions[]
 * @returns {Promise<{ flaggedUsers: Array, rulesEvaluated: number }>}
 */
export async function runAllRules(prisma, rules) {
  const activeRules = rules.filter(r => r.isActive && r.conditions.length > 0)

  if (activeRules.length === 0) return { flaggedUsers: [], rulesEvaluated: 0 }

  // Collect all needed metric keys across all rules
  const allMetricKeys = new Set()
  for (const rule of activeRules) {
    for (const cond of rule.conditions) allMetricKeys.add(cond.metric)
  }

  // Use smallest time window across all rules to avoid over-fetching
  // (each rule applies its own sinceDate when filtering results)
  // For context fetching we use null (all time) — rules do their own filtering
  const globalMetrics = await computeAllUserMetrics(prisma, allMetricKeys, null)

  // Evaluate each rule independently with its own time window
  // For per-rule time filtering we re-compute only for that rule's metrics if it has a window
  // For simplicity (and to avoid N DB round-trips), we compute a per-rule filtered metric set
  // only when a rule has a timeWindowDays set.

  // userId → { rules: [], metrics: {} }
  const flagMap = new Map()

  for (const rule of activeRules) {
    const sinceDate = rule.timeWindowDays
      ? new Date(Date.now() - rule.timeWindowDays * 24 * 60 * 60 * 1000)
      : null

    let metricsToUse = globalMetrics
    if (sinceDate) {
      const ruleMetricKeys = new Set(rule.conditions.map(c => c.metric))
      metricsToUse = await computeAllUserMetrics(prisma, ruleMetricKeys, sinceDate)
    }

    const matchedUserIds = evaluateRule(metricsToUse, rule)

    for (const userId of matchedUserIds) {
      if (!flagMap.has(userId)) flagMap.set(userId, { rules: [], metrics: {} })
      const entry = flagMap.get(userId)

      entry.rules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matchedConditions: rule.conditions.map(c => {
          const val = (metricsToUse.get(userId) ?? {})[c.metric] ?? 0
          const opLabel = OPERATOR_LABELS[c.operator] ?? c.operator
          const metaLabel = METRIC_DEFINITIONS[c.metric]?.label ?? c.metric
          return `${metaLabel} ${opLabel} ${c.threshold} (actual: ${val})`
        }),
      })

      // Merge metrics - always use global (all-time) metrics for display so
      // they are consistent with the all-time context data (top trade partners,
      // auction sellers, etc.). metricsToUse is only used for rule evaluation.
      const userMetrics = globalMetrics.get(userId) ?? {}
      Object.assign(entry.metrics, userMetrics)
    }
  }

  if (flagMap.size === 0) return { flaggedUsers: [], rulesEvaluated: activeRules.length }

  const flaggedUserIds = [...flagMap.keys()]

  // Fetch user info + mute status
  const users = await prisma.user.findMany({
    where: { id: { in: flaggedUserIds } },
    select: {
      id: true,
      username: true,
      discordTag: true,
      avatar: true,
      discordAvatar: true,
      suspiciousActivityMute: {
        select: { id: true, reason: true, createdAt: true, mutedBy: { select: { username: true } } },
      },
    },
  })

  const userMap = new Map(users.map(u => [u.id, u]))

  // Build context (top partners, sellers, shared IPs)
  const contextMap = await buildContextForUsers(prisma, flaggedUserIds, null)

  const flaggedUsers = flaggedUserIds.map(userId => {
    const user = userMap.get(userId)
    const entry = flagMap.get(userId)
    const mute = user?.suspiciousActivityMute ?? null

    return {
      userId,
      username: user?.username ?? null,
      discordTag: user?.discordTag ?? null,
      avatar: user?.avatar ?? user?.discordAvatar ?? null,
      isMuted: !!mute,
      muteInfo: mute
        ? { reason: mute.reason, mutedBy: mute.mutedBy?.username, mutedAt: mute.createdAt }
        : null,
      triggeredRules: entry.rules,
      metrics: entry.metrics,
      context: contextMap[userId] ?? { topTradePartners: [], topAuctionSellers: [], sharedIPUsers: [] },
    }
  })

  return { flaggedUsers, rulesEvaluated: activeRules.length }
}

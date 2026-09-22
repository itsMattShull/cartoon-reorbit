// server/utils/touchTrades.js
// Detection + enrichment for the admin "Track Touch Trades" report: same-mint
// cToons that bounced back and forth between the same two players (an
// initial trade, then at least one trade back) — a pattern worth a human
// look for possible collusion or a points/rarity exploit.
//
// Source of truth is CtoonOwnerLog (method='TRADE'), written once per side on
// every accepted TradeOffer (server/api/trade/offers/[id]/accept.post.js).
// Legacy TradeRoom trades (server/socket-server.js) never wrote to this
// table, so they are outside what this report can see — see the doc comment
// on findTouchTradeGroups for why that's an acceptable, documented gap
// rather than a silent one.
import { decryptIp } from './ip-encrypt.js'

export const MAX_DATE_RANGE_DAYS = 180
export const DEFAULT_DATE_RANGE_DAYS = 90
// Defensive cap on the raw self-join result, applied in SQL via LIMIT. Paired
// with MAX_DATE_RANGE_DAYS and the (ctoonId, mintNumber, method, createdAt)
// index, this keeps a single request bounded regardless of how much trade
// volume the date window actually contains.
export const MAX_CANDIDATE_GROUPS = 2000
// How far outside a trade's own timestamp to look for a login/fingerprint
// row when inferring IP/device — wide enough to usually find *something* for
// an active account, narrow enough that a hit six months later isn't passed
// off as "at the time of this trade".
const INFERENCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export function groupKeyFor(ctoonId, mintNumber, userLo, userHi) {
  return `${ctoonId}:${mintNumber}:${userLo}:${userHi}`
}

export function clampDateRange(fromInput, toInput) {
  const now = new Date()
  let to = toInput ? new Date(toInput) : now
  if (Number.isNaN(to.getTime())) to = now
  if (to > now) to = now

  let from = fromInput ? new Date(fromInput) : new Date(to.getTime() - DEFAULT_DATE_RANGE_DAYS * 86400000)
  if (Number.isNaN(from.getTime())) from = new Date(to.getTime() - DEFAULT_DATE_RANGE_DAYS * 86400000)

  const minFrom = new Date(to.getTime() - MAX_DATE_RANGE_DAYS * 86400000)
  if (from < minFrom) from = minFrom
  if (from > to) from = to

  return { from, to }
}

/**
 * Finds every (ctoonId, mintNumber, userLo, userHi) pair with at least one
 * direction reversal within [from, to] — i.e. a TRADE log row A: userLo→userHi
 * (or the reverse) followed later by a TRADE log row B undoing it. That single
 * pair is "an initial trade, then a trade back": exactly two legs. A chain
 * that bounces three, four, five times over still satisfies this on its
 * first reversal — fetchGroupLegs below pulls the *full* leg history for a
 * flagged pair, not just the two rows that tripped the match.
 *
 * prisma.$queryRaw is called here as a tagged template, so every `${...}`
 * interpolation below becomes a bound parameter, never a spliced-in string —
 * no caller-supplied value (dates, in practice; usernames are resolved to ids
 * and filtered in a separate, ordinary Prisma call, never reaching this query
 * at all) can change the SQL text itself.
 */
export async function findTouchTradeGroups(prisma, { from, to }) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT
      a."ctoonId" AS "ctoonId",
      a."mintNumber" AS "mintNumber",
      LEAST(a."userId", a."counterpartyUserId") AS "userLo",
      GREATEST(a."userId", a."counterpartyUserId") AS "userHi"
    FROM "CtoonOwnerLog" a
    JOIN "CtoonOwnerLog" b
      ON a."ctoonId" = b."ctoonId"
     AND a."mintNumber" = b."mintNumber"
     AND a."userId" = b."counterpartyUserId"
     AND a."counterpartyUserId" = b."userId"
     AND b."createdAt" > a."createdAt"
    WHERE a."method" = 'TRADE' AND b."method" = 'TRADE'
      AND a."ctoonId" IS NOT NULL AND a."mintNumber" IS NOT NULL
      AND a."userId" IS NOT NULL AND a."counterpartyUserId" IS NOT NULL
      AND a."createdAt" >= ${from} AND a."createdAt" <= ${to}
      AND b."createdAt" >= ${from} AND b."createdAt" <= ${to}
    LIMIT ${MAX_CANDIDATE_GROUPS}
  `
  return rows.map(r => ({
    ctoonId: r.ctoonId,
    mintNumber: r.mintNumber,
    userLo: r.userLo,
    userHi: r.userHi,
    groupKey: groupKeyFor(r.ctoonId, r.mintNumber, r.userLo, r.userHi)
  }))
}

/**
 * Full TRADE leg history for a page of already-identified groups, plus
 * best-effort IP/device per leg. Batched throughout (one query per data
 * source for the whole page, never one per group) — see the performance
 * review this was written against for why that matters at this table's
 * write volume.
 */
export async function fetchGroupLegs(prisma, { groups, from, to }) {
  if (!groups.length) return new Map()

  const ctoonIds = Array.from(new Set(groups.map(g => g.ctoonId)))
  const pairKey = (ctoonId, mintNumber) => `${ctoonId}:${mintNumber}`
  const wantedPairs = new Set(groups.map(g => pairKey(g.ctoonId, g.mintNumber)))

  // Narrowed by ctoonId + method + date range (all covered by the
  // (ctoonId, mintNumber, method, createdAt) index); the mintNumber match
  // against wantedPairs happens in JS since Prisma has no multi-column IN.
  const logRows = await prisma.ctoonOwnerLog.findMany({
    where: {
      ctoonId: { in: ctoonIds },
      method: 'TRADE',
      createdAt: { gte: from, lte: to }
    },
    orderBy: { createdAt: 'asc' },
    select: {
      ctoonId: true,
      mintNumber: true,
      userId: true,
      counterpartyUserId: true,
      counterpartyUsername: true,
      createdAt: true,
      tradeOfferId: true
    }
  })

  const legsByGroup = new Map(groups.map(g => [g.groupKey, []]))
  for (const row of logRows) {
    if (!wantedPairs.has(pairKey(row.ctoonId, row.mintNumber))) continue
    const lo = row.userId < row.counterpartyUserId ? row.userId : row.counterpartyUserId
    const hi = row.userId < row.counterpartyUserId ? row.counterpartyUserId : row.userId
    const key = groupKeyFor(row.ctoonId, row.mintNumber, lo, hi)
    const bucket = legsByGroup.get(key)
    if (!bucket) continue // belongs to some other pair that traded this same mint — not this group
    bucket.push({
      createdAt: row.createdAt,
      fromUserId: row.counterpartyUserId,
      toUserId: row.userId,
      tradeOfferId: row.tradeOfferId || null
    })
  }

  // Batch-fetch every referenced TradeOffer (full item lists on both sides +
  // captured IP/UA) in one round trip.
  const tradeOfferIds = Array.from(new Set(
    Array.from(legsByGroup.values()).flat().map(l => l.tradeOfferId).filter(Boolean)
  ))
  const offersById = new Map()
  if (tradeOfferIds.length) {
    const offers = await prisma.tradeOffer.findMany({
      where: { id: { in: tradeOfferIds } },
      select: {
        id: true,
        initiatorId: true,
        recipientId: true,
        pointsOffered: true,
        createdAt: true,
        updatedAt: true,
        initiatorIp: true,
        initiatorUserAgent: true,
        acceptedByUserId: true,
        acceptedByIp: true,
        acceptedByUserAgent: true,
        ctoons: {
          select: {
            role: true,
            userCtoon: {
              select: {
                mintNumber: true,
                ctoon: { select: { id: true, name: true, assetPath: true, rarity: true } }
              }
            }
          }
        }
      }
    })
    for (const o of offers) offersById.set(o.id, o)
  }

  // Every user we'll need a username, and possibly an inferred IP/device, for.
  const involvedUserIds = new Set()
  for (const g of groups) { involvedUserIds.add(g.userLo); involvedUserIds.add(g.userHi) }
  for (const o of offersById.values()) {
    involvedUserIds.add(o.initiatorId)
    if (o.acceptedByUserId) involvedUserIds.add(o.acceptedByUserId)
  }

  const userIdList = Array.from(involvedUserIds)
  const [users, requestMeta] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIdList } }, select: { id: true, username: true } }),
    fetchInferredRequestMeta(prisma, { userIds: userIdList, from, to })
  ])
  const usernameById = new Map(users.map(u => [u.id, u.username]))

  const meta = (userId, timestamp, captured) => {
    if (captured?.ip) {
      return {
        userId,
        ip: decryptIp(captured.ip),
        userAgent: captured.userAgent || null,
        source: 'captured',
        capturedAt: captured.at || null
      }
    }
    const inferred = requestMeta(userId, timestamp)
    if (inferred) {
      return { userId, ip: decryptIp(inferred.ip), userAgent: inferred.userAgent || null, source: 'inferred', capturedAt: inferred.capturedAt }
    }
    return { userId, ip: null, userAgent: null, source: 'unavailable', capturedAt: null }
  }

  const result = new Map()
  for (const g of groups) {
    const legs = (legsByGroup.get(g.groupKey) || []).map(leg => {
      const offer = leg.tradeOfferId ? offersById.get(leg.tradeOfferId) : null
      const base = {
        createdAt: leg.createdAt,
        fromUserId: leg.fromUserId,
        fromUsername: usernameById.get(leg.fromUserId) || null,
        toUserId: leg.toUserId,
        toUsername: usernameById.get(leg.toUserId) || null,
        tradeOfferId: leg.tradeOfferId,
        limitedDetail: !offer
      }
      if (!offer) {
        return {
          ...base,
          pointsOffered: null,
          itemsOffered: [],
          itemsRequested: [],
          initiator: meta(leg.fromUserId, leg.createdAt, null),
          acceptedBy: meta(leg.toUserId, leg.createdAt, null)
        }
      }
      const itemsFor = (role) => offer.ctoons
        .filter(c => c.role === role)
        .map(c => ({
          name: c.userCtoon?.ctoon?.name || null,
          assetPath: c.userCtoon?.ctoon?.assetPath || null,
          rarity: c.userCtoon?.ctoon?.rarity || null,
          mintNumber: c.userCtoon?.mintNumber ?? null
        }))
      return {
        ...base,
        pointsOffered: offer.pointsOffered,
        itemsOffered: itemsFor('OFFERED'),
        itemsRequested: itemsFor('REQUESTED'),
        initiator: meta(offer.initiatorId, offer.createdAt, offer.initiatorIp ? { ip: offer.initiatorIp, userAgent: offer.initiatorUserAgent, at: offer.createdAt } : null),
        acceptedBy: offer.acceptedByUserId
          ? meta(offer.acceptedByUserId, offer.updatedAt, offer.acceptedByIp ? { ip: offer.acceptedByIp, userAgent: offer.acceptedByUserAgent, at: offer.updatedAt } : null)
          : null
      }
    })
    result.set(g.groupKey, legs)
  }
  return result
}

/**
 * Returns a `nearest(userId, timestamp)` lookup backed by one batched query
 * per source (LoginLog, DeviceFingerprintLog) for the whole page of users,
 * rather than a per-user or per-leg query. Device-fingerprint rows are
 * preferred when both exist near the same timestamp since they carry a
 * device description as well as an IP.
 */
async function fetchInferredRequestMeta(prisma, { userIds, from, to }) {
  if (!userIds.length) return () => null

  const windowFrom = new Date(from.getTime() - INFERENCE_WINDOW_MS)
  const windowTo = new Date(to.getTime() + INFERENCE_WINDOW_MS)

  const [loginRows, fpRows] = await Promise.all([
    prisma.loginLog.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: windowFrom, lte: windowTo } },
      select: { userId: true, ip: true, createdAt: true }
    }),
    prisma.deviceFingerprintLog.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: windowFrom, lte: windowTo } },
      select: { userId: true, ip: true, deviceType: true, createdAt: true }
    })
  ])

  const byUser = new Map()
  const add = (userId, entry) => {
    if (!byUser.has(userId)) byUser.set(userId, [])
    byUser.get(userId).push(entry)
  }
  for (const r of loginRows) add(r.userId, { ip: r.ip, userAgent: null, createdAt: r.createdAt })
  for (const r of fpRows) add(r.userId, { ip: r.ip, userAgent: r.deviceType, createdAt: r.createdAt })
  for (const entries of byUser.values()) entries.sort((a, b) => a.createdAt - b.createdAt)

  return (userId, timestamp) => {
    const entries = byUser.get(userId)
    if (!entries || !entries.length) return null
    const target = timestamp.getTime()
    let best = null
    let bestDiff = Infinity
    for (const e of entries) {
      const diff = Math.abs(e.createdAt.getTime() - target)
      if (diff < bestDiff) { bestDiff = diff; best = e }
    }
    if (!best || bestDiff > INFERENCE_WINDOW_MS) return null
    return { ip: best.ip, userAgent: best.userAgent, capturedAt: best.createdAt }
  }
}

// server/utils/tradeOfferRules.js
// Pure rules shared by the trade-offer create path and the counter path.
//
// Deliberately imports nothing but h3: server/utils/tradeOffer.js pulls in
// `@/server/prisma`, a Nuxt-only alias that bare Node can't resolve, which would
// make these helpers untestable under `npm test` (`node --test`). Everything
// here is decision logic with no database access, so it can be exercised
// directly — see tests/tradeOfferRules.test.js.
//
// The invariant this module exists to protect:
//   A counter re-uses the cToons already committed to the offer it replaces, so
//   those cToons must be exempt from the "already in a pending trade" guard.
//   That exemption is scoped by OFFER ID and never by cToon ID — see
//   pendingTradeGuardWhere for why the difference is load-bearing.
import { createError } from 'h3'

// The limits live in their own import-free module so components/newsite/Trade.vue
// can enforce the same ceiling at selection time without bundling h3.
//
// Imported by RELATIVE path, not the `@/` alias: this module is loaded directly
// by `node --test`, which has no alias resolution — the same reason the header
// above gives for keeping prisma out of here.
import { MAX_CTOONS_PER_SIDE, MAX_COUNTER_CHAIN_DEPTH, MAX_TRADE_POINTS, MAX_PENDING_OFFERS_PER_PAIR } from './tradeOfferLimits.js'

export { MAX_CTOONS_PER_SIDE, MAX_COUNTER_CHAIN_DEPTH, MAX_TRADE_POINTS, MAX_PENDING_OFFERS_PER_PAIR }

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuid (value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

export const fmtPoints = (n) => Number(n || 0).toLocaleString('en-US')

/**
 * Normalizes one side's cToon id list: rejects non-arrays and oversized lists,
 * requires every entry to be a non-empty string, and drops duplicates.
 *
 * Duplicates matter beyond tidiness. The same physical cToon can be named twice
 * under two spellings (a raw UUID and the synthetic `uc|…` token), both of which
 * resolve to one UserCtoon. The nested create would then emit two rows with the
 * same (tradeOfferId, userCtoonId, role), violating the unique constraint and
 * rolling the whole transaction back with an opaque P2002.
 */
export function normalizeCtoonIdList (list, label) {
  if (!Array.isArray(list)) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be an array` })
  }
  if (list.length > MAX_CTOONS_PER_SIDE) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} may contain at most ${MAX_CTOONS_PER_SIDE} cToons`
    })
  }
  for (const id of list) {
    if (typeof id !== 'string' || !id) {
      throw createError({ statusCode: 400, statusMessage: `${label} contains an invalid cToon reference` })
    }
  }
  return [...new Set(list)]
}

/** An offer has to actually offer or ask for something, or it is just a notification. */
export function assertOfferHasContent ({ resolvedOffered, resolvedRequested, pointsOffered, pointsRequested = 0 }) {
  if (!resolvedOffered.length && !resolvedRequested.length && !pointsOffered && !pointsRequested) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A trade offer must include at least one cToon or some points.'
    })
  }
}

/**
 * Validates one points field (pointsOffered or pointsRequested): a
 * non-negative integer under the shared ceiling.
 *
 * Deliberately the same ceiling for both fields, even though only
 * pointsOffered is ever checked against a real balance — pointsRequested has
 * no balance check at all at this stage (see the schema comment on
 * TradeOffer.pointsRequested), so this ceiling is the only thing standing
 * between it and Number.MAX_SAFE_INTEGER.
 */
export function assertValidPointsAmount (value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be a non-negative integer` })
  }
  if (value > MAX_TRADE_POINTS) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} may not exceed ${fmtPoints(MAX_TRADE_POINTS)} points`
    })
  }
}

/** True when a pair already has as many PENDING offers between them as allowed. */
export function pendingOfferPairLimitExceeded (existingPendingCount) {
  return existingPendingCount >= MAX_PENDING_OFFERS_PER_PAIR
}

/** The same physical cToon cannot sit on both sides of one offer. */
export function assertNoCrossSideOverlap (resolvedOffered, resolvedRequested) {
  const requested = new Set(resolvedRequested)
  if (resolvedOffered.some(id => requested.has(id))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The same cToon cannot be both offered and requested.'
    })
  }
}

/**
 * Builds the `where` clause used by the "is this cToon already committed to a
 * pending trade?" guard.
 *
 * The exemption is scoped by OFFER, never by cToon id. Subtracting the countered
 * offer's cToon ids from the list being checked would exempt those cToons from
 * *every* pending offer, not just the one being replaced — so a cToon sitting in
 * the countered offer AND in some unrelated pending offer would pass the only
 * check that stops it being committed to two live trades at once, and could then
 * be transferred twice.
 */
export function pendingTradeGuardWhere (userCtoonIds, excludeOfferIds = []) {
  const tradeOffer = { status: 'PENDING' }
  if (excludeOfferIds.length) tradeOffer.id = { notIn: [...excludeOfferIds] }
  return { userCtoonId: { in: userCtoonIds }, tradeOffer }
}

/**
 * Decides whether `callerId` may counter `original` with a new offer addressed
 * to `newRecipientId`, and returns the reason when they may not.
 *
 * All four conditions matter:
 *  - PENDING          — a settled offer has nothing left to counter.
 *  - caller is the RECIPIENT, not merely "a party". Authorizing either party
 *    (which is what reject.post.js does, and is the natural thing to copy) would
 *    let the initiator counter their own offer, combining with the guard
 *    exemption above to release their own cToons from pending state at will.
 *  - the counter goes back to the ORIGINAL INITIATOR. Without this a counter can
 *    redirect the trade to an attacker-controlled account, turning the exemption
 *    into a way to move a contested cToon into an offer with a colluding party.
 *  - not a self-trade, which would make the points release and re-lock below
 *    operate on a single balance inside one transaction.
 */
export function counterAuthorizationError ({ original, callerId, newRecipientId }) {
  if (!original) return 'not-found'
  if (original.status !== 'PENDING') return 'not-pending'
  if (original.recipientId !== callerId) return 'not-recipient'
  if (original.initiatorId !== newRecipientId) return 'wrong-recipient'
  if (original.initiatorId === callerId) return 'self-trade'
  return null
}

/** True when the negotiation has gone too many counters deep to allow another. */
export function exceedsCounterChainDepth (depth) {
  return depth >= MAX_COUNTER_CHAIN_DEPTH
}

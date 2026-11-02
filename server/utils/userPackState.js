// server/utils/userPackState.js
// The single source of truth for "what can be done with this sealed pack right now".
//
// A sealed pack (UserPack with opened = false) can be in one of these states, and there is deliberately NO column
// recording it — it is derived from the rows that put the pack there:
//
//   in a PENDING trade   = a TradeOfferPack row pointing at a TradeOffer with status 'PENDING'
//   in an ACTIVE auction = an Auction row (kind PACK) with status 'ACTIVE'
//
// Rules (product-owner decisions): a sealed pack is in at most ONE place at a time.
//   open     : not already opened, NOT in an active auction, NOT in a pending trade
//   trade    : not opened, NOT in an active auction (and not already in another pending trade)
//   auction  : not opened, NOT in a pending trade   (and not already in another active auction)
//
// ── Why every writer must go through lockPacksForUpdate ────────────────────────────────────────────────────────────
// Because state is derived from OTHER tables, checking it and then writing is a classic write-skew under READ
// COMMITTED: a trade-create and an auction-create for the same pack each see no row in the other table and both
// commit, leaving the pack in a trade AND an auction (and an `open` racing either leaves an offer holding an opened
// pack that can never be accepted). cToons dodge this with an isTradeable=false claim; packs have no such column, so
// the serialisation point is the UserPack row itself:
//
//     tx -> lockPacksForUpdate(tx, ids)   // SELECT ... FOR UPDATE, ids sorted => no deadlock between writers
//        -> re-read owner / opened / lock state UNDER the lock
//        -> only then insert the trade row / auction row / mark opened
//
// Global lock order for any transaction touching these tables (keep it, or two writers can deadlock):
//   Pack row (open only)  ->  TradeOffer / Auction row  ->  UserPack rows (sorted by id)  ->  UserPoints (by userId)
//   ->  LockedPoints
//
// This module imports only h3 and two import-free sibling modules so `node --test` can load it (see the header of
// server/utils/tradeOfferRules.js for why).
import { createError } from 'h3'
import { isUuid } from './tradeOfferRules.js'
import { UNAVAILABLE_REQUEST_MESSAGE } from './lockRules.js'

/** Most packs on one side of a trade offer. Each one is a row lock, so this stays small (cToons use 10,000 — no). */
export const MAX_PACKS_PER_SIDE = 50

/** One generic message for every reason a pack can't be used, so responses can't be used to probe pack state. */
export const PACK_UNAVAILABLE_MESSAGE = UNAVAILABLE_REQUEST_MESSAGE.replace('cToons', 'packs')

export const PACK_BLOCK = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  NOT_OWNER: 'NOT_OWNER',
  OPENED: 'OPENED',
  IN_AUCTION: 'IN_AUCTION',
  IN_TRADE: 'IN_TRADE'
})

/**
 * Validates one side's pack id list: an array of UUIDs, deduplicated, at most MAX_PACKS_PER_SIDE.
 * Deliberately NOT normalizeCtoonIdList: that accepts any string and 10,000 entries, which here would mean taking
 * thousands of row locks in one statement.
 */
export function normalizePackIdList (list, label = 'packs') {
  if (list == null) return []
  if (!Array.isArray(list)) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be an array` })
  }
  for (const id of list) {
    if (!isUuid(id)) {
      throw createError({ statusCode: 400, statusMessage: `${label} contains an invalid pack reference` })
    }
  }
  const unique = [...new Set(list.map(id => id.toLowerCase()))]
  if (unique.length > MAX_PACKS_PER_SIDE) {
    throw createError({ statusCode: 400, statusMessage: `${label} may contain at most ${MAX_PACKS_PER_SIDE} packs` })
  }
  return unique
}

/** The same sealed pack cannot sit on both sides of one offer. */
export function assertNoPackCrossSideOverlap (offeredPackIds, requestedPackIds) {
  const requested = new Set(requestedPackIds)
  if (offeredPackIds.some(id => requested.has(id))) {
    throw createError({ statusCode: 400, statusMessage: 'The same pack cannot be both offered and requested.' })
  }
}

/**
 * Pure decision: why `pack` can't be used right now, or null if it can. A sealed pack may be in only ONE place at a
 * time, so for every use (open / trade / auction) being in an active auction or a pending trade blocks it — which
 * covers the product rules: "in an auction => can't be traded", "in a pending trade => can't be auctioned", and
 * "in either => can't be opened".
 *
 * @param {{ id:string, userId:string, opened:boolean }|null|undefined} pack  the row as read UNDER lock
 * @param {{ inActiveAuction:boolean, inPendingTrade:boolean }} state
 * @param {string} ownerId  who must own it
 */
export function packBlockReason (pack, state, ownerId) {
  if (!pack) return PACK_BLOCK.NOT_FOUND
  if (pack.userId !== ownerId) return PACK_BLOCK.NOT_OWNER
  if (pack.opened) return PACK_BLOCK.OPENED
  if (state?.inActiveAuction) return PACK_BLOCK.IN_AUCTION
  if (state?.inPendingTrade) return PACK_BLOCK.IN_TRADE
  return null
}

const SPECIFIC_MESSAGES = Object.freeze({
  [PACK_BLOCK.NOT_FOUND]: 'Pack not found.',
  [PACK_BLOCK.NOT_OWNER]: 'Pack not found.',
  [PACK_BLOCK.OPENED]: 'Pack already opened',
  [PACK_BLOCK.IN_AUCTION]: 'This pack is in an active auction.',
  [PACK_BLOCK.IN_TRADE]: 'This pack is part of a pending trade. Resolve the trade first.'
})

/**
 * The HTTP error for a block reason. `generic` collapses every reason into one string — used wherever the caller is
 * asking about a pack that belongs to SOMEONE ELSE (a requested pack), so the response can't be used to tell opened,
 * not-owned, in-auction and in-trade apart. For your own packs the specific reason is shown, since it's actionable.
 */
export function packBlockError (reason, { generic = false } = {}) {
  if (generic) return createError({ statusCode: 400, statusMessage: PACK_UNAVAILABLE_MESSAGE })
  const statusCode = reason === PACK_BLOCK.NOT_FOUND || reason === PACK_BLOCK.NOT_OWNER ? 404
    : reason === PACK_BLOCK.OPENED ? 400 // unchanged from the old open-pack endpoint
    : 409
  return createError({ statusCode, statusMessage: SPECIFIC_MESSAGES[reason] || PACK_UNAVAILABLE_MESSAGE })
}

/**
 * Locks the given UserPack rows (sorted by id, so concurrent writers can't deadlock each other) and returns them.
 * MUST be called with a transaction client, first, before any check that a following write depends on.
 *
 * @returns {Promise<Array<{ id:string, userId:string, packId:string, opened:boolean }>>}
 */
export async function lockPacksForUpdate (tx, ids) {
  const sorted = [...new Set(ids)].sort()
  if (!sorted.length) return []
  return tx.$queryRaw`
    SELECT "id", "userId", "packId", "opened"
      FROM "UserPack"
     WHERE "id" = ANY(${sorted}::text[])
     ORDER BY "id"
       FOR UPDATE`
}

/**
 * Which of these packs sit in an active auction / a pending trade right now. Two set queries, however many packs.
 * Pass `excludeOfferIds` to ignore the trade offers being replaced by a counter (scoped by OFFER id, never by pack id,
 * for the same reason as pendingTradeGuardWhere in tradeOfferRules.js).
 *
 * @returns {Promise<Map<string,{ inActiveAuction:boolean, inPendingTrade:boolean, pendingOfferIds:string[] }>>}
 */
export async function getPackLockState (db, ids, { excludeOfferIds = [] } = {}) {
  const out = new Map(ids.map(id => [id, { inActiveAuction: false, inPendingTrade: false, pendingOfferIds: [] }]))
  if (!ids.length) return out

  const tradeOffer = { status: 'PENDING' }
  if (excludeOfferIds.length) tradeOffer.id = { notIn: [...excludeOfferIds] }

  const [auctions, trades] = await Promise.all([
    db.auction.findMany({
      where: { userPackId: { in: ids }, status: 'ACTIVE' },
      select: { userPackId: true }
    }),
    db.tradeOfferPack.findMany({
      where: { userPackId: { in: ids }, tradeOffer },
      select: { userPackId: true, tradeOfferId: true }
    })
  ])
  for (const a of auctions) {
    const s = out.get(a.userPackId)
    if (s) s.inActiveAuction = true
  }
  for (const t of trades) {
    const s = out.get(t.userPackId)
    if (s) {
      s.inPendingTrade = true
      s.pendingOfferIds.push(t.tradeOfferId)
    }
  }
  return out
}

/**
 * Lock + verify in one step: the call every writer should make first inside its transaction.
 * Throws if any pack is missing, not owned by `ownerId`, already opened, or in an active auction / pending trade.
 * `generic` (default false) uses the single probe-proof message — set it for packs owned by the OTHER party.
 * Returns the locked rows.
 */
export async function lockAndAssertPacks (tx, ids, { ownerId, excludeOfferIds = [], generic = false }) {
  const rows = await lockPacksForUpdate(tx, ids)
  const byId = new Map(rows.map(r => [r.id, r]))
  const states = await getPackLockState(tx, ids, { excludeOfferIds })
  for (const id of ids) {
    const reason = packBlockReason(byId.get(id), states.get(id), ownerId)
    if (reason) throw packBlockError(reason, { generic })
  }
  return rows
}

/** Appends audit rows. `entries` are { userPackId, packId, userId, method, counterpartyUserId?, ... }. */
export async function logPackOwners (tx, entries) {
  if (!entries.length) return
  await tx.packOwnerLog.createMany({ data: entries })
}

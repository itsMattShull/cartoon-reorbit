// server/utils/tradeAuctionBanRules.js
// Pure half of the admin "Ban Trades/Auctions" tool (no database), so it can be unit-tested on its own.
// The database half is server/utils/tradeAuctionBan.js.
//
// A ban is symmetric: it stops either user trading with the other, and stops either user bidding on an auction the
// other one created. It is stored once per pair with the smaller id first (TradeAuctionBan.userAId < userBId, also a
// CHECK constraint in the migration), so "is A banned with B?" and "is B banned with A?" read the same row.

// What a banned user sees. Deliberately plain: it says they can't trade/bid with that user, not that an admin did it.
export const TRADE_BANNED_MESSAGE = "You can't trade with this user."
export const BID_BANNED_MESSAGE = "You can't bid on this user's auctions."

export const MAX_BAN_REASON_LENGTH = 500

/** The pair in stored order: [smaller id, larger id]. Throws if either is missing or they are the same user. */
export function orderBanPair (a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') {
    throw Object.assign(new Error('Pick two users.'), { statusCode: 400 })
  }
  if (a === b) {
    throw Object.assign(new Error('Pick two different users.'), { statusCode: 400 })
  }
  return a < b ? [a, b] : [b, a]
}

/** Prisma `where` for the one ban row that covers these two users, whichever order they are given in. */
export function banPairWhere (a, b) {
  const [userAId, userBId] = orderBanPair(a, b)
  return { userAId, userBId }
}

/**
 * Prisma `where` for every ban row between `userId` and anyone in `otherIds` (either side of the pair).
 * Used to drop banned auto-bidders on an auction in one query.
 */
export function bansBetweenWhere (userId, otherIds) {
  const others = [...new Set((otherIds || []).filter(id => id && id !== userId))]
  return {
    OR: [
      { userAId: userId, userBId: { in: others } },
      { userBId: userId, userAId: { in: others } }
    ]
  }
}

/** The id on the other side of a ban row from `userId`. */
export function otherSideOf (ban, userId) {
  return ban.userAId === userId ? ban.userBId : ban.userAId
}

/** Trims the optional reason, caps its length, and turns an empty one into null. */
export function normalizeBanReason (reason) {
  if (reason == null) return null
  const s = String(reason).trim()
  if (!s) return null
  return s.slice(0, MAX_BAN_REASON_LENGTH)
}

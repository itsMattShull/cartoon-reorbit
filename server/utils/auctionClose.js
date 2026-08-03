export const AUCTION_CLOSE_SOLD = 'SOLD'
export const AUCTION_CLOSE_NO_SALE = 'NO_SALE'
export const AUCTION_CLOSE_DOUBLE_SALE = 'DOUBLE_SALE'

/**
 * Did `other` sell the same physical cToon while `auction` was still running?
 *
 * This is the signature of a double sale: two ACTIVE auctions existed for one
 * UserCtoon, both closed, both winners were debited and the seller credited
 * twice, and the later close reassigned the cToon away from the earlier winner.
 * A partial unique index now prevents the overlap from being created, so this
 * only fires for pairs that predate it.
 *
 * Deliberately NOT written as "the current owner is no longer the seller".
 * `creatorId` and the cToon's owner legitimately diverge: when an inactive
 * account is dissolved, server/cron/sync-guild-members.js reassigns creatorId
 * on any auction already running to the official account but leaves the cToon
 * with the original user. Comparing the two would abort those auctions at
 * close.
 */
export function isConflictingSale(auction, other) {
  if (!other || !auction) return false
  if (other.id === auction.id) return false
  if (other.status !== 'CLOSED') return false
  if (!other.winnerId || !other.winnerAt) return false

  // Guard falsy separately from NaN: `new Date(null)` is the epoch, not an
  // invalid date, so a null createdAt would compare as "listed in 1970" and
  // make every prior sale look like a conflict.
  if (!auction.createdAt || !other.winnerAt) return false

  const soldAt = new Date(other.winnerAt).getTime()
  const listedAt = new Date(auction.createdAt).getTime()
  if (Number.isNaN(soldAt) || Number.isNaN(listedAt)) return false

  return soldAt > listedAt
}

/**
 * What should closing this auction actually do? Pure so the rule can be tested
 * without a database — the cost of getting it wrong is minted points.
 */
export function resolveAuctionCloseOutcome({ auction, winningBid, otherAuctions = [] }) {
  const conflict = otherAuctions.find((other) => isConflictingSale(auction, other))
  if (conflict) {
    return { outcome: AUCTION_CLOSE_DOUBLE_SALE, conflictingAuctionId: conflict.id }
  }
  if (!winningBid) {
    return { outcome: AUCTION_CLOSE_NO_SALE, conflictingAuctionId: null }
  }
  return { outcome: AUCTION_CLOSE_SOLD, conflictingAuctionId: null }
}

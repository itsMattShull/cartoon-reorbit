// server/utils/auctionOnlySchedule.js
//
// Which copies make up a scheduled AuctionOnly batch, and what order they go up
// in. Pure so it can be unit-tested (see tests/auctionOnlyBatchOrder.test.js);
// the endpoint that uses it is server/api/admin/auction-only/index.post.js.

/**
 * Mint order, oldest first among copies with no mint number.
 */
export function byMintThenAge(a, b) {
  const aMint = Number.isInteger(a.mintNumber) ? a.mintNumber : Number.POSITIVE_INFINITY
  const bMint = Number.isInteger(b.mintNumber) ? b.mintNumber : Number.POSITIVE_INFINITY
  if (aMint !== bMint) return aMint - bMint
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

/**
 * Pick `count` copies out of `pool` and put them in release order.
 *
 * Two separate decisions, which this deliberately keeps apart:
 *
 *  1. Which copies are in the batch. Lowest mints first, except that an
 *     explicitly picked copy is always included — the admin UI always sends one,
 *     since it is how a cToon gets chosen, and for a single auction it is the
 *     whole point. Including a picked copy from outside the window displaces the
 *     last copy that would otherwise have made it.
 *  2. What order they are released in. Always mint order.
 *
 * These used to be conflated: the picked copy was moved to the front to force it
 * into the batch and then kept that position when release times were assigned,
 * so picking #57 while scheduling a run released #57 ahead of #41.
 *
 * @param {Array<{id: string, mintNumber: number|null, createdAt: Date|string}>} pool
 * @param {number} count
 * @param {string|null} pickedId - userCtoonId the admin explicitly selected
 * @returns {Array<object>} the chosen copies, in release order
 */
export function selectAuctionOnlyBatch(pool, count, pickedId = null) {
  const finalCount = Math.min(Number(count) || 0, pool.length)
  if (finalCount < 1) return []

  const sorted = [...pool].sort(byMintThenAge)

  let batch = sorted
  if (pickedId && sorted.some(a => a.id === pickedId)) {
    batch = [sorted.find(a => a.id === pickedId), ...sorted.filter(a => a.id !== pickedId)]
  }

  return batch.slice(0, finalCount).sort(byMintThenAge)
}

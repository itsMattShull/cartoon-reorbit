// Shared Auction House filters for the server-side tabs (My Auctions, My Bids, All).
//
// The Current tab filters in the browser (components/newsite/AuctionHouse.vue → applyFilters);
// these helpers mirror its rules so every tab answers a filter the same way.

/** A price bound from the query string: a finite, non-negative number, or null for "no bound". */
export function parsePriceBound (value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Reads priceMin / priceMax / excludeSecondEditions off a getQuery() result. */
export function parseListFilterQuery (query = {}) {
  return {
    priceMin: parsePriceBound(query.priceMin),
    priceMax: parsePriceBound(query.priceMax),
    excludeSecondEditions: ['1', 'true', 'yes'].includes(String(query.excludeSecondEditions).toLowerCase())
  }
}

/** The price the filter compares against: the highest bid, or the opening bid when nobody has bid. */
export function auctionFilterPrice (item) {
  const highest = Number(item?.highestBid ?? 0)
  return (highest > 0 ? highest : Number(item?.initialBid ?? 0)) || 0
}

/** In-memory check for already-shaped auction items. */
export function matchesPriceAndEdition (item, { priceMin = null, priceMax = null, excludeSecondEditions = false } = {}) {
  if (excludeSecondEditions && item?.isSecondEdition) return false
  if (priceMin == null && priceMax == null) return true
  const price = auctionFilterPrice(item)
  if (priceMin != null && price < priceMin) return false
  if (priceMax != null && price > priceMax) return false
  return true
}

/**
 * Prisma `where` fragment for the same price rule, against the Auction row's own columns
 * (highestBid is kept current by bid.post.js / autoBid.js and stays 0 until the first bid).
 * Returns null when there is no bound.
 */
export function priceRangeWhere (priceMin, priceMax) {
  if (priceMin == null && priceMax == null) return null
  const range = {}
  if (priceMin != null) range.gte = priceMin
  if (priceMax != null) range.lte = priceMax
  return {
    OR: [
      { highestBid: { gt: 0, ...range } },
      { highestBid: { lte: 0 }, initialBet: range }
    ]
  }
}

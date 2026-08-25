// server/utils/collectionWorth.js
// Estimated total value for the "Collection Worth" summary on the My
// Collection page (components/newsite/MyCollection.vue).
//
// Deliberately the SAME estimation the Owners tab in the cToon Info Modal
// already shows per mint (components/newsite/CtoonInfoCard.vue's
// getMintAdjustedValue, fed by POST /api/ctoon/valuations): a straight,
// ungated average of every closed+won auction sale for that cToon (no
// MIN_SAMPLE_SIZE floor — a single sale is still "the" average there),
// falling back to the cMart/face price when it has never sold, then adjusted
// for mint number so a low mint values higher than a high one of the same
// cToon. Reusing that exact formula means a total here can never disagree
// with what a player sees for the same mint in the Owners tab.
import { prisma } from '../prisma.js'
import { getAuctionReferenceValues } from './economyValuation.js'

// Defensive cap on how many distinct cToon types one request will price. A
// realistic collector sits far below this; it exists so a pathological
// collection can't turn a page load into an unbounded IN-list query.
export const MAX_WORTH_CTOON_TYPES = 3000

/**
 * Mirrors CtoonInfoCard.vue's getMintAdjustedValue exactly:
 *   adjustedValue = base × (1 + (highestMint - mintNumber) / highestMint)
 * No adjustment for unlimited-edition cToons (mintNumber null) or
 * single-mint sets (highestMint <= 1) — a premium would be meaningless there.
 */
export function mintAdjustedValue(base, mintNumber, highestMint) {
  if (!base) return 0
  if (mintNumber == null || !highestMint || highestMint <= 1) return base
  const multiplier = 1 + (highestMint - mintNumber) / highestMint
  return base * multiplier
}

/**
 * Combine owned copies with their priced sources into the collection-worth
 * total. Pure — no I/O — so it's unit-testable without a database.
 *
 * `ownedCopies` is an array of { ctoonId, mintNumber }, one entry per owned
 * UserCtoon row. `priceByCtoonId`/`highestMintByCtoonId` are
 * Map<ctoonId, value> — the average-sale Map comes from
 * getAuctionReferenceValues() and holds { avgPrice, count }.
 */
export function computeCollectionWorth(ownedCopies, avgSaleByCtoonId, faceByCtoonId, highestMintByCtoonId) {
  let total = 0
  let itemCount = 0
  const distinctCtoonIds = new Set()

  for (const { ctoonId, mintNumber } of ownedCopies) {
    distinctCtoonIds.add(ctoonId)
    itemCount += 1

    const avgSale = avgSaleByCtoonId.get(ctoonId)?.avgPrice ?? null
    const face = faceByCtoonId.get(ctoonId) ?? null
    const base = avgSale ?? face ?? 0
    const highestMint = highestMintByCtoonId.get(ctoonId) ?? null

    total += mintAdjustedValue(base, mintNumber, highestMint)
  }

  return { itemCount, distinctCount: distinctCtoonIds.size, total: Math.round(total) }
}

// Everything above this line is pure. This is the one I/O helper the
// endpoint needs beyond getAuctionReferenceValues (already shared with
// server/utils/economyValuation.js) — face price and highest-mint-in-
// existence per ctoonId, matching /api/ctoon/valuations.post.js's queries
// exactly (face price is the raw Ctoon.price, unfiltered by inCmart, and
// highest mint is the max mintNumber across ALL owners of that cToon, not
// just the caller's own copies).
export async function getFaceAndMintData(ctoonIds) {
  if (!ctoonIds.length) return { faceByCtoonId: new Map(), highestMintByCtoonId: new Map() }

  const [ctoonRows, mintAggs] = await Promise.all([
    prisma.ctoon.findMany({
      where: { id: { in: ctoonIds } },
      select: { id: true, price: true }
    }),
    prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: { ctoonId: { in: ctoonIds } },
      _max: { mintNumber: true }
    })
  ])

  return {
    faceByCtoonId: new Map(ctoonRows.map(c => [c.id, c.price])),
    highestMintByCtoonId: new Map(mintAggs.map(r => [r.ctoonId, r._max.mintNumber]))
  }
}

export { getAuctionReferenceValues }

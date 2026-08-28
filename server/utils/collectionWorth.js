// server/utils/collectionWorth.js
// Shared valuation helpers for the "Collection Worth" summary on the My
// Collection page (components/newsite/MyCollection.vue).
import { prisma } from '../prisma.js'
import { Prisma } from '@prisma/client'
import { MIN_SAMPLE_SIZE } from './economyValuation.js'

export { MIN_SAMPLE_SIZE }

// Defensive cap on how many distinct cToon types one request will price. A
// realistic collector sits far below this; it exists so a pathological
// collection can't turn a page load into an unbounded IN-list query. Far
// higher than /api/ctoon/valuations.post.js's MAX_VALUATION_IDS (500) because
// that endpoint prices individually-selected items with per-copy detail,
// while this one only needs one row per distinct ctoonId.
export const MAX_WORTH_CTOON_TYPES = 3000

// All-time weighted-average price per ctoonId, split by source (AUCTION vs
// TRADE), read from the precomputed CtoonPriceDaily table in one query — same
// weighted-average shape server/api/economy/top-valuable.get.js uses per
// source, just grouped by source too so both metrics come back in one round
// trip. Callers should run ensureEconomyDataFresh() first so this doesn't
// read a stale/empty aggregate.
export async function getDailyReferenceValues(ctoonIds) {
  const empty = { auction: new Map(), trade: new Map() }
  if (!ctoonIds.length) return empty

  const rows = await prisma.$queryRaw`
    SELECT
      cpd."ctoonId" AS "ctoonId",
      cpd."source" AS "source",
      (SUM(cpd."avgPrice" * cpd."volume") FILTER (WHERE cpd."avgPrice" IS NOT NULL)
        / NULLIF(SUM(cpd."volume") FILTER (WHERE cpd."avgPrice" IS NOT NULL), 0))::float AS "avgPrice",
      SUM(cpd."volume") FILTER (WHERE cpd."avgPrice" IS NOT NULL)::int AS "pricedVolume"
    FROM "CtoonPriceDaily" cpd
    WHERE cpd."ctoonId" IN (${Prisma.join(ctoonIds)})
    GROUP BY cpd."ctoonId", cpd."source"
  `

  const auction = new Map()
  const trade = new Map()
  for (const row of rows) {
    const target = row.source === 'AUCTION' ? auction : row.source === 'TRADE' ? trade : null
    if (!target) continue
    target.set(row.ctoonId, { avgPrice: row.avgPrice, pricedVolume: row.pricedVolume })
  }
  return { auction, trade }
}

/**
 * Combine per-ctoonId owned quantities with their priced sources into the
 * collection-worth totals. Pure — no I/O — so it's unit-testable without a
 * database.
 *
 * `ctoons` is a Map<ctoonId, { quantity, facePrice, lastAuctionSoldPrice }>.
 * `auctionRefs`/`tradeRefs` are the Maps returned by
 * getDailyReferenceValues(): ctoonId -> { avgPrice, pricedVolume }.
 *
 * Every metric falls back to the cToon's face/cMart price when its own
 * source doesn't have enough transactions to trust (MIN_SAMPLE_SIZE, the same
 * threshold the Economy page uses to avoid a thin sample effectively
 * revealing one specific sale) — and to 0 when there's no face price either
 * (an auction-only cToon that has never sold). `priced` counts, per metric,
 * how many owned copies got a real number rather than the face-price
 * fallback, so the UI can say "based on real sales for N of your M items".
 */
export function computeCollectionWorth(ctoons, auctionRefs, tradeRefs) {
  const totals = { faceValue: 0, avgAuctionSold: 0, avgTraded: 0, lastAuctionSold: 0 }
  const priced = { avgAuctionSold: 0, avgTraded: 0, lastAuctionSold: 0 }
  let itemCount = 0
  let distinctCount = 0

  for (const [ctoonId, entry] of ctoons) {
    const quantity = entry.quantity || 0
    if (!quantity) continue
    const face = entry.facePrice ?? 0

    itemCount += quantity
    distinctCount += 1
    totals.faceValue += quantity * face

    const auctionRef = auctionRefs.get(ctoonId)
    const auctionPriced = !!auctionRef && auctionRef.pricedVolume >= MIN_SAMPLE_SIZE && auctionRef.avgPrice != null
    totals.avgAuctionSold += quantity * (auctionPriced ? auctionRef.avgPrice : face)
    if (auctionPriced) priced.avgAuctionSold += quantity

    const tradeRef = tradeRefs.get(ctoonId)
    const tradePriced = !!tradeRef && tradeRef.pricedVolume >= MIN_SAMPLE_SIZE && tradeRef.avgPrice != null
    totals.avgTraded += quantity * (tradePriced ? tradeRef.avgPrice : face)
    if (tradePriced) priced.avgTraded += quantity

    const lastSoldPriced = entry.lastAuctionSoldPrice != null
    totals.lastAuctionSold += quantity * (lastSoldPriced ? entry.lastAuctionSoldPrice : face)
    if (lastSoldPriced) priced.lastAuctionSold += quantity
  }

  for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key])

  return { itemCount, distinctCount, totals, priced }
}

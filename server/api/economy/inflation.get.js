// GET /api/economy/inflation
// Single composite "inflation index" for the Economy page ticker: a weighted
// average sale price this week vs. last week, expressed as a percent change.
//
// Sourced from CtoonPriceDaily combining BOTH sources (AUCTION + TRADE)
// rather than auction-only. An auction-only index would swing on whatever
// handful of cToons happened to get auctioned that week and say nothing
// about the (larger, steadier) trade side of the economy; combining both
// gives a broader, less noisy read on "are prices moving" at the cost of
// blending two different pricing mechanisms into one number — acceptable
// for a single glanceable ticker figure, not for the per-source Top 10 views
// elsewhere on the page, which intentionally stay split by source.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'

const CACHE_KEY = 'economy:inflation:v1'
// Matches summary.get.js's cadence — this is a slow-moving weekly figure, no
// value in recomputing more often than the page polls it.
const CACHE_TTL = 60

const FLAT_THRESHOLD_PCT = 0.05 // below this, "up"/"down" would just be sub-percent floating-point noise

async function computeInflation() {
  // Both weeks pulled in one query so the two aggregates are computed from an
  // identical snapshot of the table. Filters on `date` alone, no `source`
  // predicate, so this is served by CtoonPriceDaily's @@index([date, ctoonId,
  // volume]) the same way trending.get.js's date-only query is.
  const rows = await prisma.$queryRaw`
    SELECT
      (SUM(cpd."avgPrice" * cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL AND cpd."date" >= NOW() - INTERVAL '7 days'
      ))::float AS "thisWeekSum",
      (SUM(cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL AND cpd."date" >= NOW() - INTERVAL '7 days'
      ))::int AS "thisWeekVolume",
      (SUM(cpd."avgPrice" * cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL
          AND cpd."date" >= NOW() - INTERVAL '14 days'
          AND cpd."date" < NOW() - INTERVAL '7 days'
      ))::float AS "lastWeekSum",
      (SUM(cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL
          AND cpd."date" >= NOW() - INTERVAL '14 days'
          AND cpd."date" < NOW() - INTERVAL '7 days'
      ))::int AS "lastWeekVolume"
    FROM "CtoonPriceDaily" cpd
    WHERE cpd."date" >= NOW() - INTERVAL '14 days'
  `
  const row = rows[0] || {}
  const thisWeekVolume = row.thisWeekVolume || 0
  const lastWeekVolume = row.lastWeekVolume || 0

  // Zero priced volume in either window means there's nothing to divide by —
  // and nothing honest to compare against. Say so rather than showing a
  // fabricated 0%.
  if (thisWeekVolume <= 0 || lastWeekVolume <= 0) {
    return { available: false }
  }

  const indexThisWeek = row.thisWeekSum / thisWeekVolume
  const indexLastWeek = row.lastWeekSum / lastWeekVolume
  const pctChange = ((indexThisWeek - indexLastWeek) / indexLastWeek) * 100

  const direction = Math.abs(pctChange) < FLAT_THRESHOLD_PCT
    ? 'flat'
    : (pctChange > 0 ? 'up' : 'down')

  return {
    available: true,
    // The index itself is just the weighted-average sale price this week, in
    // points — directly interpretable ("the average sale is worth N points
    // right now"), not renormalized to an arbitrary base like a real stock
    // index would be. Simpler to reason about for a single glance figure.
    indexThisWeek: Math.round(indexThisWeek),
    pctChange: Math.round(pctChange * 10) / 10,
    direction
  }
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  await ensureEconomyDataFresh()

  const inflation = await computeInflation()
  try {
    await redis.set(CACHE_KEY, JSON.stringify(inflation), 'EX', CACHE_TTL)
  } catch {}

  return inflation
})

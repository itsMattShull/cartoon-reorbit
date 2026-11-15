// GET /api/economy/inflation
// Composite "inflation index" for the Economy page ticker: a weighted average
// sale price this week vs. last week, expressed as a percent change. Returns
// TWO variants side by side — the full index over every priced cToon, and a
// second one that additionally excludes high-mint cToons (see
// HIGH_MINT_EXCLUSION_THRESHOLD below) — rather than picking one, since a
// mass-produced cToon's volume is legitimate market activity for the "all
// cToons" figure but swamps the "excluding high mints" one by design.
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

const CACHE_KEY = 'economy:inflation:v2'
// Matches summary.get.js's cadence — this is a slow-moving weekly figure, no
// value in recomputing more often than the page polls it.
const CACHE_TTL = 60

const FLAT_THRESHOLD_PCT = 0.05 // below this, "up"/"down" would just be sub-percent floating-point noise

// A cToon minted MORE than this many times is common enough that its sale
// volume can swing a volume-weighted average on sheer supply rather than on
// anything meaningful about demand — excluded from the "ex. high mints"
// index variant only; the full index, and the per-source Top 10/trending/
// history views elsewhere on the Economy page, stay unfiltered, since a
// common cToon's own activity and price history are still legitimate data
// to look up there. Deliberately a separate, stricter, always-on cutoff from
// economyFilters.js's HIGH_MINT_THRESHOLD (500) — that one is an opt-in
// browse filter for the per-cToon list, this one is a fixed policy for the
// index figure.
const HIGH_MINT_EXCLUSION_THRESHOLD = 400

// Both windows' sum/volume in, one { available, indexThisWeek, pctChange,
// direction } result out — shared by the full index and the ex-high-mints
// variant below, which differ only in which rows feed these four numbers.
function deriveIndex(thisWeekSum, thisWeekVolume, lastWeekSum, lastWeekVolume) {
  // Zero priced volume in either window means there's nothing to divide by —
  // and nothing honest to compare against. Say so rather than showing a
  // fabricated 0%.
  if (thisWeekVolume <= 0 || lastWeekVolume <= 0) {
    return { available: false }
  }

  const indexThisWeek = thisWeekSum / thisWeekVolume
  const indexLastWeek = lastWeekSum / lastWeekVolume
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

async function computeInflation() {
  // Both weeks, and both the full and ex-high-mints variants, pulled in one
  // query so all four aggregates are computed from an identical snapshot of
  // the table. Joined to Ctoon only to apply the high-mint exclusion;
  // still served by CtoonPriceDaily's @@index([date, ctoonId, volume]) the
  // same way trending.get.js's date-only query is, since the join is on
  // Ctoon's own primary key.
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
      ))::int AS "lastWeekVolume",
      (SUM(cpd."avgPrice" * cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL AND cpd."date" >= NOW() - INTERVAL '7 days'
          AND c."totalMinted" <= ${HIGH_MINT_EXCLUSION_THRESHOLD}
      ))::float AS "thisWeekSumExHighMints",
      (SUM(cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL AND cpd."date" >= NOW() - INTERVAL '7 days'
          AND c."totalMinted" <= ${HIGH_MINT_EXCLUSION_THRESHOLD}
      ))::int AS "thisWeekVolumeExHighMints",
      (SUM(cpd."avgPrice" * cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL
          AND cpd."date" >= NOW() - INTERVAL '14 days'
          AND cpd."date" < NOW() - INTERVAL '7 days'
          AND c."totalMinted" <= ${HIGH_MINT_EXCLUSION_THRESHOLD}
      ))::float AS "lastWeekSumExHighMints",
      (SUM(cpd."volume") FILTER (
        WHERE cpd."avgPrice" IS NOT NULL
          AND cpd."date" >= NOW() - INTERVAL '14 days'
          AND cpd."date" < NOW() - INTERVAL '7 days'
          AND c."totalMinted" <= ${HIGH_MINT_EXCLUSION_THRESHOLD}
      ))::int AS "lastWeekVolumeExHighMints"
    FROM "CtoonPriceDaily" cpd
    JOIN "Ctoon" c ON c.id = cpd."ctoonId"
    WHERE cpd."date" >= NOW() - INTERVAL '14 days'
  `
  const row = rows[0] || {}

  return {
    ...deriveIndex(row.thisWeekSum || 0, row.thisWeekVolume || 0, row.lastWeekSum || 0, row.lastWeekVolume || 0),
    exHighMints: deriveIndex(
      row.thisWeekSumExHighMints || 0,
      row.thisWeekVolumeExHighMints || 0,
      row.lastWeekSumExHighMints || 0,
      row.lastWeekVolumeExHighMints || 0
    ),
    // Sent down so the client's explanation modal always quotes the real cutoff
    // rather than a hardcoded copy that could silently drift from this one.
    highMintExclusionThreshold: HIGH_MINT_EXCLUSION_THRESHOLD
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

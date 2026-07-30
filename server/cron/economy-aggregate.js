// server/cron/economy-aggregate.js
// Daily aggregation for the Economy page: turns raw Auction/TradeOffer
// activity into per-cToon-per-day price/volume rows (CtoonPriceDaily),
// which server/api/economy/* reads live. Scheduled from
// server/cron/sync-guild-members.js, and also triggered on demand (Redis-gated)
// by server/utils/economyFreshness.js from the Economy API routes themselves —
// so the page self-heals even if that cron worker isn't deployed. Can also be
// run by hand with `npm run economy:aggregate` (useful for a full rebuild).
//
// AUCTION rows come straight from closed+won Auctions (real prices).
// TRADE rows don't have a native per-cToon price — trades swap cToons (and
// sometimes points), not a fixed price — so each accepted TradeOffer's value
// is imputed: pointsOffered plus the best-known reference value (auction
// average, falling back to cMart price) of every cToon in the trade that
// has one, divided by how many of those cToons had a known reference value.
// That single imputed number is then recorded against every cToon in the
// trade for that day. cToons with no known reference anywhere in the trade
// are skipped (no basis to price them from).
//
// Reference values used for imputation reflect *current* auction averages,
// not a historical snapshot as of the trade's date — acceptable for a
// trend-level economy view, but means a full backfill re-prices old trades
// using today's averages rather than what was known at the time.
//
// Incremental runs find which *days* saw new activity since the cursor, then
// recompute those days in full. Recomputing only the new rows would corrupt
// the average for a day that was already partially aggregated.
import { prisma } from '../prisma.js'
import { getAuctionReferenceValues, getCmartPrices, pickReferenceValue } from '../utils/economyValuation.js'

const LOCK_KEY = 847362910 // arbitrary constant unique to this job, for pg_try_advisory_lock
const SAFETY_BUFFER_MS = 5 * 60 * 1000 // re-scan a trailing window each run to catch stragglers
const INSERT_CHUNK = 2000

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function withAdvisoryLock(fn) {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[economy-aggregate] another run already holds the lock, skipping')
    return
  }
  try {
    await fn()
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}

async function getCursor() {
  return prisma.economyAggregateCursor.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  })
}

// Replace every row for the affected days in one shot. Delete-then-insert is
// correct here because each affected day is recomputed in full above.
async function replaceDays(source, dates, rows) {
  if (!dates.length) return
  await prisma.$transaction([
    prisma.ctoonPriceDaily.deleteMany({ where: { source, date: { in: dates } } }),
    ...chunk(rows, INSERT_CHUNK).map(batch =>
      prisma.ctoonPriceDaily.createMany({ data: batch, skipDuplicates: true })
    )
  ])
}

async function aggregateAuctions(sinceDate) {
  // COALESCE to endAt because winnerAt was only added in the
  // 20250611235321_auction_bids_and_winner migration — every auction closed
  // before then has winnerAt NULL (the old closedAt column was dropped), and
  // keying on winnerAt alone silently skips all of that history.
  const rows = await prisma.$queryRaw`
    WITH touched AS (
      SELECT DISTINCT date_trunc('day', COALESCE(a."winnerAt", a."endAt")) AS d
      FROM "Auction" a
      WHERE a.status = 'CLOSED'
        AND a."winnerId" IS NOT NULL
        AND COALESCE(a."winnerAt", a."endAt") > ${sinceDate}
    )
    SELECT
      uc."ctoonId" AS "ctoonId",
      date_trunc('day', COALESCE(a."winnerAt", a."endAt")) AS "date",
      AVG(a."highestBid")::float AS "avgPrice",
      COUNT(*)::int AS "volume"
    FROM "Auction" a
    JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
    WHERE a.status = 'CLOSED'
      AND a."winnerId" IS NOT NULL
      AND date_trunc('day', COALESCE(a."winnerAt", a."endAt")) IN (SELECT d FROM touched)
    GROUP BY 1, 2
  `

  const dates = [...new Set(rows.map(r => r.date.getTime()))].map(t => new Date(t))
  await replaceDays('AUCTION', dates, rows.map(r => ({
    ctoonId: r.ctoonId,
    source: 'AUCTION',
    date: r.date,
    avgPrice: r.avgPrice,
    volume: r.volume
  })))

  return { days: dates.length, rows: rows.length }
}

async function aggregateTrades(sinceDate) {
  const dayRows = await prisma.$queryRaw`
    SELECT DISTINCT date_trunc('day', "updatedAt") AS d
    FROM "TradeOffer"
    WHERE status = 'ACCEPTED' AND "updatedAt" > ${sinceDate}
  `
  const days = dayRows.map(r => r.d).filter(Boolean)
  if (!days.length) return { days: 0, rows: 0 }

  const rangeStart = new Date(Math.min(...days.map(d => d.getTime())))
  const rangeEnd = new Date(Math.max(...days.map(d => d.getTime())) + 24 * 60 * 60 * 1000)

  const offers = await prisma.tradeOffer.findMany({
    where: { status: 'ACCEPTED', updatedAt: { gte: rangeStart, lt: rangeEnd } },
    select: {
      updatedAt: true,
      pointsOffered: true,
      ctoons: { select: { userCtoon: { select: { ctoonId: true } } } }
    }
  })
  if (!offers.length) return { days: 0, rows: 0 }

  const allCtoonIds = [...new Set(offers.flatMap(o => o.ctoons.map(c => c.userCtoon.ctoonId)))]
  const [auctionRefs, cmartPrices] = await Promise.all([
    getAuctionReferenceValues(allCtoonIds),
    getCmartPrices(allCtoonIds)
  ])

  // dayKey -> ctoonId -> running total, so multiple trades touching the same
  // cToon on the same day average together into one daily row.
  const byDay = new Map()

  for (const offer of offers) {
    const ctoonIds = offer.ctoons.map(c => c.userCtoon.ctoonId)
    if (!ctoonIds.length) continue

    let knownValueSum = offer.pointsOffered || 0
    let knownCount = 0
    for (const ctoonId of ctoonIds) {
      const ref = pickReferenceValue(ctoonId, auctionRefs, cmartPrices)
      if (ref != null) {
        knownValueSum += ref
        knownCount++
      }
    }
    if (knownCount === 0) continue // nothing in this trade has a known value to impute from

    const impliedValue = knownValueSum / knownCount
    const day = new Date(Date.UTC(
      offer.updatedAt.getUTCFullYear(),
      offer.updatedAt.getUTCMonth(),
      offer.updatedAt.getUTCDate()
    ))
    const dayKey = day.getTime()

    const dayMap = byDay.get(dayKey) || new Map()
    for (const ctoonId of ctoonIds) {
      const agg = dayMap.get(ctoonId) || { sum: 0, count: 0 }
      agg.sum += impliedValue
      agg.count += 1
      dayMap.set(ctoonId, agg)
    }
    byDay.set(dayKey, dayMap)
  }

  const dates = []
  const rows = []
  for (const [dayKey, dayMap] of byDay) {
    const date = new Date(dayKey)
    dates.push(date)
    for (const [ctoonId, agg] of dayMap) {
      rows.push({
        ctoonId,
        source: 'TRADE',
        date,
        avgPrice: agg.sum / agg.count,
        volume: agg.count
      })
    }
  }

  await replaceDays('TRADE', dates, rows)
  return { days: dates.length, rows: rows.length }
}

export async function runEconomyAggregate() {
  await withAdvisoryLock(async () => {
    const cursor = await getCursor()
    const runStartedAt = new Date()

    const auctions = await aggregateAuctions(cursor.lastAuctionProcessedAt)
    const trades = await aggregateTrades(cursor.lastTradeProcessedAt)

    const newCursor = new Date(runStartedAt.getTime() - SAFETY_BUFFER_MS)
    await prisma.economyAggregateCursor.update({
      where: { id: 'singleton' },
      data: { lastAuctionProcessedAt: newCursor, lastTradeProcessedAt: newCursor }
    })

    console.log(
      `[economy-aggregate] auctions: ${auctions.days} day(s)/${auctions.rows} row(s), ` +
      `trades: ${trades.days} day(s)/${trades.rows} row(s)`
    )
  })
}

// Reset the cursor so the next run re-scans and rebuilds all history.
export async function resetEconomyCursor() {
  const epoch = new Date(0)
  await prisma.economyAggregateCursor.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', lastAuctionProcessedAt: epoch, lastTradeProcessedAt: epoch },
    update: { lastAuctionProcessedAt: epoch, lastTradeProcessedAt: epoch }
  })
}

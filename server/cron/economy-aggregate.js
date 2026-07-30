// server/cron/economy-aggregate.js
// Daily aggregation for the Economy page: turns raw Auction/TradeOffer
// activity into per-cToon-per-day price/volume rows (CtoonPriceDaily),
// which server/api/economy/* reads live. Scheduled from
// server/cron/sync-guild-members.js.
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
import { prisma } from '../prisma.js'
import { getAuctionReferenceValues, getCmartPrices, pickReferenceValue } from '../utils/economyValuation.js'

const LOCK_KEY = 847362910 // arbitrary constant unique to this job, for pg_try_advisory_lock
const SAFETY_BUFFER_MS = 5 * 60 * 1000 // re-scan a trailing window each run to catch stragglers

async function withAdvisoryLock(fn) {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`
  if (!locked) {
    console.log('[economy-aggregate] another run already holds the lock, skipping')
    return
  }
  try {
    await fn()
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`
  }
}

async function getCursor() {
  return prisma.economyAggregateCursor.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  })
}

async function aggregateAuctionDays(sinceDate) {
  const days = await prisma.$queryRaw`
    SELECT DISTINCT date_trunc('day', a."winnerAt") AS day
    FROM "Auction" a
    WHERE a.status = 'CLOSED' AND a."winnerId" IS NOT NULL AND a."winnerAt" > ${sinceDate}
  `
  for (const { day } of days) {
    const rows = await prisma.$queryRaw`
      SELECT uc."ctoonId" AS "ctoonId", AVG(a."highestBid")::float AS "avgPrice", COUNT(*)::int AS "volume"
      FROM "Auction" a
      JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
      WHERE a.status = 'CLOSED' AND a."winnerId" IS NOT NULL
        AND date_trunc('day', a."winnerAt") = ${day}
      GROUP BY uc."ctoonId"
    `
    for (const row of rows) {
      await prisma.ctoonPriceDaily.upsert({
        where: { ctoonId_source_date: { ctoonId: row.ctoonId, source: 'AUCTION', date: day } },
        create: { ctoonId: row.ctoonId, source: 'AUCTION', date: day, avgPrice: row.avgPrice, volume: row.volume },
        update: { avgPrice: row.avgPrice, volume: row.volume }
      })
    }
  }
  return days.length
}

async function aggregateTradeDays(sinceDate) {
  const days = await prisma.$queryRaw`
    SELECT DISTINCT date_trunc('day', "updatedAt") AS day
    FROM "TradeOffer"
    WHERE status = 'ACCEPTED' AND "updatedAt" > ${sinceDate}
  `
  for (const { day } of days) {
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    const offers = await prisma.tradeOffer.findMany({
      where: { status: 'ACCEPTED', updatedAt: { gte: day, lt: nextDay } },
      select: {
        pointsOffered: true,
        ctoons: { select: { userCtoon: { select: { ctoonId: true } } } }
      }
    })
    if (!offers.length) continue

    const allCtoonIds = [...new Set(offers.flatMap(o => o.ctoons.map(c => c.userCtoon.ctoonId)))]
    const [auctionRefs, cmartPrices] = await Promise.all([
      getAuctionReferenceValues(allCtoonIds),
      getCmartPrices(allCtoonIds)
    ])

    // ctoonId -> running total so multiple trades touching the same cToon
    // on the same day average together into one daily row.
    const perCtoon = new Map()

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
      for (const ctoonId of ctoonIds) {
        const agg = perCtoon.get(ctoonId) || { sum: 0, count: 0 }
        agg.sum += impliedValue
        agg.count += 1
        perCtoon.set(ctoonId, agg)
      }
    }

    for (const [ctoonId, agg] of perCtoon) {
      const avgPrice = agg.sum / agg.count
      await prisma.ctoonPriceDaily.upsert({
        where: { ctoonId_source_date: { ctoonId, source: 'TRADE', date: day } },
        create: { ctoonId, source: 'TRADE', date: day, avgPrice, volume: agg.count },
        update: { avgPrice, volume: agg.count }
      })
    }
  }
  return days.length
}

export async function runEconomyAggregate() {
  await withAdvisoryLock(async () => {
    const cursor = await getCursor()
    const runStartedAt = new Date()

    const auctionDayCount = await aggregateAuctionDays(cursor.lastAuctionProcessedAt)
    const tradeDayCount = await aggregateTradeDays(cursor.lastTradeProcessedAt)

    const newCursor = new Date(runStartedAt.getTime() - SAFETY_BUFFER_MS)
    await prisma.economyAggregateCursor.update({
      where: { id: 'singleton' },
      data: { lastAuctionProcessedAt: newCursor, lastTradeProcessedAt: newCursor }
    })

    console.log(`[economy-aggregate] processed ${auctionDayCount} auction day(s), ${tradeDayCount} trade day(s)`)
  })
}

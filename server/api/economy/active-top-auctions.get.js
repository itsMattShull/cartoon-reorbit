// GET /api/economy/active-top-auctions
// "Stock ticker" style feed of the top 10 currently-ACTIVE auctions with at
// least one bid, ranked by current highest bid. Polled by
// components/newsite/EconomyAuctionTicker.vue, which also joins each shown
// auction's Socket.IO room (auction_${auctionId}) for instant push updates
// between polls — this endpoint is only the periodic "who's in the top 10
// right now" refresh, not the live bid feed itself.
//
// Deliberately reads Auction directly rather than going through
// ensureEconomyDataFresh(): that freshness gate exists to keep the
// CtoonPriceDaily aggregate (a cron-populated table for CLOSED sales) from
// going stale, and has nothing to do with live ACTIVE auctions — calling it
// here would add latency and risk triggering a heavy aggregate run for a
// table this query never touches. Same reasoning ticker.get.js's
// auction-sourced (CLOSED) branch already follows.
//
// Anonymity note: same stance as ticker.get.js — no username, userId, or
// highestBidderId is ever selected into the payload. The click-through modal
// (EconomyAuctionViewModal -> AuctionDetails) does show the current top
// bidder once opened, same as the full Auction House page already does for
// any logged-in viewer; only this summary row stays anonymous.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_KEY = 'economy:active-top-auctions:v1'
// Shorter than the ~15s client poll so a cache hit never serves a genuinely
// stale rank order across more than one poll cycle.
const CACHE_TTL = 10

const LIMIT = 10

async function computeActiveTopAuctions() {
  // Served by the partial index Auction_active_highestBid_idx (WHERE
  // status='ACTIVE' AND "highestBid" > 0), see prisma/schema.prisma's note on
  // the Auction model — without it Postgres sorts every ACTIVE row before
  // applying the LIMIT.
  const rows = await prisma.$queryRaw`
    SELECT
      a.id AS "auctionId",
      c."name" AS "ctoonName",
      c."assetPath" AS "assetPath",
      c."rarity" AS "rarity",
      a."highestBid" AS "highestBid",
      a."endAt" AS "endAt"
    FROM "Auction" a
    JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
    JOIN "Ctoon" c ON c.id = uc."ctoonId"
    WHERE a.status = 'ACTIVE'
      AND a."highestBid" > 0
      AND a."highestBidderId" IS NOT NULL
    ORDER BY a."highestBid" DESC
    LIMIT ${LIMIT}
  `

  return rows.map(r => ({
    auctionId: r.auctionId,
    ctoonName: r.ctoonName,
    assetPath: r.assetPath || null,
    rarity: r.rarity,
    highestBid: Number(r.highestBid),
    endAt: r.endAt
  }))
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  const entries = await computeActiveTopAuctions()
  try {
    await redis.set(CACHE_KEY, JSON.stringify(entries), 'EX', CACHE_TTL)
  } catch {}

  return entries
})

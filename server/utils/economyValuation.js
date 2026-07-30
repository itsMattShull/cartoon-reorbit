// server/utils/economyValuation.js
// Shared valuation helpers for the Economy page (pages/newsite/economy.vue).
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'

// Minimum number of distinct transactions required before an aggregate is
// shown as a real number. Below this, a cToon's "average price" is really
// just what one or two specific players paid — showing it risks deanonymizing
// a trade/auction the page is supposed to keep anonymous. Endpoints should
// return null (and the client should render "Not enough data yet") instead.
export const MIN_SAMPLE_SIZE = 3

// All-time average closed-auction sale price per cToon, batched across a
// list of ctoonIds. Same underlying query as server/api/ctoon/valuations.post.js.
export async function getAuctionReferenceValues(ctoonIds) {
  if (!ctoonIds.length) return new Map()
  const rows = await prisma.$queryRaw`
    SELECT
      uc."ctoonId" AS "ctoonId",
      AVG(a."highestBid")::float AS "avgPrice",
      COUNT(*)::int AS "count"
    FROM "Auction" a
    JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
    WHERE uc."ctoonId" IN (${Prisma.join(ctoonIds)})
      AND a.status = 'CLOSED'
      AND a."winnerId" IS NOT NULL
    GROUP BY uc."ctoonId"
  `
  return new Map(rows.map(r => [r.ctoonId, { avgPrice: r.avgPrice, count: r.count }]))
}

// cMart price fallback for cToons with too little (or no) auction history.
export async function getCmartPrices(ctoonIds) {
  if (!ctoonIds.length) return new Map()
  const rows = await prisma.ctoon.findMany({
    where: { id: { in: ctoonIds }, inCmart: true },
    select: { id: true, price: true }
  })
  return new Map(rows.map(r => [r.id, r.price]))
}

// Best-known reference value for a cToon: its own auction average (if backed
// by enough sales), else its cMart price, else null (no basis to price it from).
export function pickReferenceValue(ctoonId, auctionRefs, cmartPrices) {
  const auctionRef = auctionRefs.get(ctoonId)
  if (auctionRef && auctionRef.count >= MIN_SAMPLE_SIZE) return auctionRef.avgPrice
  const cmart = cmartPrices.get(ctoonId)
  if (cmart != null && cmart > 0) return cmart
  return null
}

// window query param -> SQL interval, whitelisted so raw SQL never
// interpolates the caller-supplied string directly.
const WINDOW_INTERVALS = {
  '7d': Prisma.sql`NOW() - INTERVAL '7 days'`,
  '30d': Prisma.sql`NOW() - INTERVAL '30 days'`,
  all: Prisma.sql`'1970-01-01'::timestamp`
}

export function resolveWindowCutoffSql(window) {
  return WINDOW_INTERVALS[window] || WINDOW_INTERVALS['7d']
}

export function isValidWindow(window) {
  return Object.prototype.hasOwnProperty.call(WINDOW_INTERVALS, window)
}

export function isValidSource(source) {
  return source === 'AUCTION' || source === 'TRADE'
}

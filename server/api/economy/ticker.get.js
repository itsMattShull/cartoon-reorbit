// GET /api/economy/ticker?limit=
// "Stock ticker" style feed of recent high-value sales for the Economy page,
// polled by components/newsite/EconomyTicker.vue.
//
// Anonymity note: a public per-auction endpoint already exposes the winner's
// username once that auction is closed (intentional — auction winners are
// public on their own auction page elsewhere in the app), so this endpoint
// can't stop someone from cross-referencing a ticker entry back to a specific
// auction. That correlation risk is pre-existing and out of scope here. What
// this endpoint *does* own is its own payload: no username, userId, winnerId,
// or anything identifying who was involved is ever selected into the SQL
// below, so there's nothing to leak from this response specifically.
import { defineEventHandler, getQuery, createError } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getSystemUserIds } from '@/server/utils/systemAccounts'

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 30
// Short-lived on purpose: the client polls every 20-30s anyway, so nothing
// here needs to survive longer than one poll cycle.
const CACHE_TTL = 25

// Below this a "sale" is usually a rarity-floor insta-bid buyout (see
// auctionPriceSuggestion.js's isSystemSale/RARITY_FLOORS) or trade-noise, not
// something worth surfacing on a ticker. Flat rather than per-rarity — this
// only needs to screen out near-zero noise, not be a precise valuation.
const TICKER_MIN_POINTS = 100

// How far back to look on each side, and how many raw rows to pull before
// merging/limiting — bounds the scan instead of ordering the whole table.
const AUCTION_SCAN_LIMIT = 100
const TRADE_WINDOW_DAYS = 14

// A CtoonPriceDaily TRADE row is one *day's* blended average across every
// accepted trade that touched that cToon that day (see the model's comment),
// not one specific trade. Deriving a true live per-trade value (the way
// server/api/economy/ctoons/[id]/trades.get.js imputes it) here too would
// duplicate that heavier work for a feed that only needs to look plausible
// while auto-advancing every few seconds — deliberately not done. Instead,
// capping volume keeps "shown as one ticker entry" honest: at low volume the
// day's blended average is close enough to what one trade actually looked
// like that presenting it as "a trade happened" isn't misleading.
const TICKER_TRADE_MAX_VOLUME = 3

const cacheKey = (limit) => `economy:ticker:v1:${limit}`

function parseLimit(raw) {
  const n = parseInt(Array.isArray(raw) ? raw[0] : raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, n)
}

async function computeTicker(limit) {
  const systemUserIds = await getSystemUserIds()

  const [auctionRows, tradeRows] = await Promise.all([
    // Ordered/limited by winnerAt with no leading index for that column on a
    // global (non-per-ctoon) scan — Auction has @@index([status, winnerId,
    // highestBid]) but nothing with winnerAt leading. Bounding via
    // AUCTION_SCAN_LIMIT plus the 25s cache keeps the cost of that acceptable
    // for a polled feed; adding a dedicated index is out of scope here
    // (schema.prisma is off-limits for this task).
    prisma.$queryRaw`
      SELECT
        c."name" AS "ctoonName",
        c."assetPath" AS "assetPath",
        a."highestBid" AS "price",
        a."winnerAt" AS "occurredAt"
      FROM "Auction" a
      JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
      JOIN "Ctoon" c ON c.id = uc."ctoonId"
      WHERE a.status = 'CLOSED'
        AND a."winnerId" IS NOT NULL
        AND a."winnerId" NOT IN (${Prisma.join(systemUserIds)})
        AND a."highestBid" >= ${TICKER_MIN_POINTS}
      ORDER BY a."winnerAt" DESC
      LIMIT ${AUCTION_SCAN_LIMIT}
    `,
    // Served by CtoonPriceDaily's @@index([source, date, ctoonId]).
    prisma.$queryRaw`
      SELECT
        c."name" AS "ctoonName",
        c."assetPath" AS "assetPath",
        cpd."avgPrice" AS "price",
        cpd."date" AS "occurredAt"
      FROM "CtoonPriceDaily" cpd
      JOIN "Ctoon" c ON c.id = cpd."ctoonId"
      WHERE cpd."source" = 'TRADE'::"EconomySource"
        AND cpd."date" >= NOW() - make_interval(days => ${TRADE_WINDOW_DAYS})
        AND cpd."avgPrice" IS NOT NULL
        AND cpd."avgPrice" >= ${TICKER_MIN_POINTS}
        AND cpd."volume" <= ${TICKER_TRADE_MAX_VOLUME}
      ORDER BY cpd."date" DESC
      LIMIT ${AUCTION_SCAN_LIMIT}
    `
  ])

  const entries = [
    ...auctionRows.slice(0, limit).map(r => ({
      ctoonName: r.ctoonName,
      assetPath: r.assetPath || null,
      price: Number(r.price),
      source: 'AUCTION',
      occurredAt: r.occurredAt
    })),
    ...tradeRows.slice(0, limit).map(r => ({
      ctoonName: r.ctoonName,
      assetPath: r.assetPath || null,
      price: Math.round(Number(r.price)),
      source: 'TRADE',
      occurredAt: r.occurredAt
    }))
  ]

  entries.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
  return entries.slice(0, limit)
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const limit = parseLimit(getQuery(event).limit)
  const key = cacheKey(limit)

  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch {}

  const entries = await computeTicker(limit)
  try {
    await redis.set(key, JSON.stringify(entries), 'EX', CACHE_TTL)
  } catch {}

  return entries
})

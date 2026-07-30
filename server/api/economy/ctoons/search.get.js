// GET /api/economy/ctoons/search?q=&page=
// "Browse all cToons" — paginated, name-searchable list with each cToon's
// all-time average auction/trade price. Name search goes through Prisma's
// query builder (not raw SQL) so the free-text q param can't reach a query string.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'
import { redis } from '@/server/utils/redis'
import { MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'

const PAGE_SIZE = 20
const MAX_QUERY_LEN = 100
const MAX_PAGE = 500 // sane upper bound; prevents deep-pagination abuse

// This is the one Economy endpoint with a free-text param and unbounded
// pagination, so it's the most abuse-prone — cap requests per user rather
// than relying on the (currently nonexistent) global rate limiter.
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SEC = 60

async function checkRateLimit(userId) {
  try {
    const key = `economy:search-rl:${userId}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
    return count <= RATE_LIMIT_MAX
  } catch {
    return true // fail open if redis is unavailable — don't take the page down over rate limiting
  }
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!(await checkRateLimit(event.context.userId))) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests, slow down.' })
  }

  const query = getQuery(event)
  const rawQ = Array.isArray(query.q) ? query.q[0] : query.q
  const q = typeof rawQ === 'string' ? rawQ.slice(0, MAX_QUERY_LEN).trim() : ''
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
  const page = Math.max(1, Math.min(MAX_PAGE, parseInt(rawPage, 10) || 1))

  const where = q ? { name: { contains: q, mode: 'insensitive' } } : {}

  const [total, ctoons] = await Promise.all([
    prisma.ctoon.count({ where }),
    prisma.ctoon.findMany({
      where,
      select: { id: true, name: true, assetPath: true, rarity: true, releaseDate: true, createdAt: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    })
  ])

  const ctoonIds = ctoons.map(c => c.id)
  let priceRows = []
  if (ctoonIds.length) {
    priceRows = await prisma.$queryRaw`
      SELECT
        "ctoonId", "source",
        (SUM("avgPrice" * "volume") / SUM("volume"))::float AS "avgPrice",
        SUM("volume")::int AS "volume"
      FROM "CtoonPriceDaily"
      WHERE "ctoonId" IN (${Prisma.join(ctoonIds)})
      GROUP BY "ctoonId", "source"
    `
  }

  const priceByCtoon = new Map()
  for (const row of priceRows) {
    const entry = priceByCtoon.get(row.ctoonId) || {}
    const enoughData = row.volume >= MIN_SAMPLE_SIZE
    if (row.source === 'AUCTION') {
      entry.avgAuctionPrice = enoughData ? row.avgPrice : null
      entry.auctionVolume = row.volume
    } else {
      entry.avgTradePrice = enoughData ? row.avgPrice : null
      entry.tradeVolume = row.volume
    }
    priceByCtoon.set(row.ctoonId, entry)
  }

  const results = ctoons.map((c) => {
    const prices = priceByCtoon.get(c.id) || {}
    return {
      ctoonId: c.id,
      name: c.name,
      assetPath: c.assetPath,
      rarity: c.rarity,
      releaseDate: c.releaseDate || c.createdAt,
      avgAuctionPrice: prices.avgAuctionPrice ?? null,
      avgTradePrice: prices.avgTradePrice ?? null,
      auctionVolume: prices.auctionVolume || 0,
      tradeVolume: prices.tradeVolume || 0
    }
  })

  return { page, pageSize: PAGE_SIZE, total, results }
})

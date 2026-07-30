// GET /api/economy/ctoons/search?q=&page=&sort=&hideGtoons=&hidePokemon=
// "Browse all cToons" — paginated, name-searchable, sortable list with each
// cToon's all-time average auction/trade price and activity volume.
//
// Every caller-supplied value is either a bind parameter or a key into a frozen
// whitelist (see server/utils/economyFilters.js); nothing is concatenated into
// SQL. The count and page queries share one WHERE fragment so `total` can never
// describe a different population than `results`.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'
import { redis } from '@/server/utils/redis'
import { MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'
import {
  parseExclusions,
  exclusionCacheKey,
  buildSearchWhereSql,
  resolveBrowseSort,
  firstQueryValue
} from '@/server/utils/economyFilters'

const PAGE_SIZE = 20
const MAX_QUERY_LEN = 100
const MAX_PAGE = 500 // sane upper bound; prevents deep-pagination abuse

// This is the one Economy endpoint with a free-text param and unbounded
// pagination, so it's the most abuse-prone — cap requests per user rather
// than relying on the (currently nonexistent) global rate limiter.
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SEC = 60
// Volume sorts aggregate all of CtoonPriceDaily instead of touching only the
// requested page of Ctoon rows, so they get their own tighter budget.
const VOLUME_RATE_LIMIT_MAX = 10

// CtoonPriceDaily can't change faster than economyFreshness.js's 300s gate
// allows, so a shorter TTL would buy no freshness and 5x the Postgres work.
const CACHE_TTL = 300
// Only the first few pages of an unsearched browse are cached: caching keyed on
// free-text `q` would give any authenticated user an unbounded Redis keyspace,
// and MAX_PAGE=500 x 6 sorts x 4 exclusion combos would be ~60MB of pages.
const MAX_CACHED_PAGE = 5

async function checkRateLimit(userId, max) {
  const key = `economy:search-rl:${userId}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
  return count <= max
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const rawQ = firstQueryValue(query, 'q')
  const q = typeof rawQ === 'string' ? rawQ.slice(0, MAX_QUERY_LEN).trim() : ''
  const rawPage = firstQueryValue(query, 'page')
  const page = Math.max(1, Math.min(MAX_PAGE, parseInt(rawPage, 10) || 1))
  const exclusions = parseExclusions(query)
  const sort = resolveBrowseSort(firstQueryValue(query, 'sort'))
  const isVolumeSort = sort.volumeSource !== null

  try {
    const allowed = await checkRateLimit(
      event.context.userId,
      isVolumeSort ? VOLUME_RATE_LIMIT_MAX : RATE_LIMIT_MAX
    )
    if (!allowed) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests, slow down.' })
    }
  } catch (err) {
    if (err?.statusCode === 429) throw err
    // Redis is down. Fail open for the cheap sorts so the page stays usable,
    // but fail closed for the aggregate ones rather than serving unlimited
    // full-table scans.
    if (isVolumeSort) {
      throw createError({ statusCode: 503, statusMessage: 'Sorting by activity is temporarily unavailable.' })
    }
  }

  const cacheable = !q && page <= MAX_CACHED_PAGE
  const cacheKey = `economy:browse:v1:${sort.key}:${exclusionCacheKey(exclusions)}:${page}`
  if (cacheable) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch {}
  }

  // Must run before the ranking query, not after it: a volume sort's ordering
  // is read straight out of CtoonPriceDaily.
  await ensureEconomyDataFresh()

  const whereSql = buildSearchWhereSql(q, exclusions)
  const offset = (page - 1) * PAGE_SIZE

  // `total` comes from Ctoon alone. Because the volume sort LEFT JOINs, the
  // matching population is identical for all six sorts, so the pager doesn't
  // jump when the user changes sort — and an over-the-end page still reports a
  // real total instead of the undefined a COUNT(*) OVER() would give.
  const countPromise = prisma.$queryRaw`
    SELECT COUNT(*)::int AS "total" FROM "Ctoon" c ${whereSql}
  `

  const pagePromise = isVolumeSort
    ? prisma.$queryRaw`
        WITH vol AS (
          SELECT "ctoonId", SUM("volume")::int AS "v"
          FROM "CtoonPriceDaily"
          WHERE "source" = ${sort.volumeSource}::"EconomySource"
          GROUP BY "ctoonId"
        )
        SELECT
          c."id", c."name", c."assetPath", c."rarity", c."releaseDate", c."createdAt",
          -- Anything below MIN_SAMPLE_SIZE ranks as 0, so a cToon with one or two
          -- transactions is indistinguishable from one with none. Ranking on the
          -- raw count would turn the tail of this list into an enumeration of
          -- every single-trade cToon, which is what MIN_SAMPLE_SIZE exists to stop.
          (CASE WHEN COALESCE(vol."v", 0) >= ${MIN_SAMPLE_SIZE} THEN COALESCE(vol."v", 0) ELSE 0 END) AS "rankVolume"
        FROM "Ctoon" c
        LEFT JOIN vol ON vol."ctoonId" = c."id"
        ${whereSql}
        ORDER BY ${sort.orderBy}
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `
    : prisma.$queryRaw`
        SELECT c."id", c."name", c."assetPath", c."rarity", c."releaseDate", c."createdAt"
        FROM "Ctoon" c
        ${whereSql}
        ORDER BY ${sort.orderBy}
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `

  const [countRows, ctoons] = await Promise.all([countPromise, pagePromise])
  const total = countRows[0]?.total ?? 0

  const ctoonIds = ctoons.map(c => c.id)
  let priceRows = []
  if (ctoonIds.length) {
    priceRows = await prisma.$queryRaw`
      SELECT
        "ctoonId", "source",
        (SUM("avgPrice" * "volume") FILTER (WHERE "avgPrice" IS NOT NULL)
          / NULLIF(SUM("volume") FILTER (WHERE "avgPrice" IS NOT NULL), 0))::float AS "avgPrice",
        SUM("volume")::int AS "volume",
        COALESCE(SUM("volume") FILTER (WHERE "avgPrice" IS NOT NULL), 0)::int AS "pricedVolume"
      FROM "CtoonPriceDaily"
      WHERE "ctoonId" IN (${Prisma.join(ctoonIds)})
      GROUP BY "ctoonId", "source"
    `
  }

  const priceByCtoon = new Map()
  for (const row of priceRows) {
    const entry = priceByCtoon.get(row.ctoonId) || {}
    // Volume backed by too few transactions is withheld entirely, not just
    // nulled out of the price: "traded exactly once" is the same disclosure the
    // price suppression is meant to prevent.
    const showVolume = row.volume >= MIN_SAMPLE_SIZE
    const showPrice = row.pricedVolume >= MIN_SAMPLE_SIZE
    if (row.source === 'AUCTION') {
      entry.avgAuctionPrice = showPrice ? row.avgPrice : null
      entry.auctionVolume = showVolume ? row.volume : null
    } else {
      entry.avgTradePrice = showPrice ? row.avgPrice : null
      entry.tradeVolume = showVolume ? row.volume : null
    }
    priceByCtoon.set(row.ctoonId, entry)
  }

  const results = ctoons.map((c) => {
    const prices = priceByCtoon.get(c.id) || {}
    const auctionVolume = prices.auctionVolume ?? null
    const tradeVolume = prices.tradeVolume ?? null
    return {
      ctoonId: c.id,
      name: c.name,
      assetPath: c.assetPath,
      rarity: c.rarity,
      releaseDate: c.releaseDate || c.createdAt,
      avgAuctionPrice: prices.avgAuctionPrice ?? null,
      avgTradePrice: prices.avgTradePrice ?? null,
      auctionVolume,
      tradeVolume,
      // The value this page was ordered by, so the client can show the sort key
      // on the row instead of leaving the ordering unexplained.
      sortVolume: sort.volumeSource === 'TRADE'
        ? tradeVolume
        : sort.volumeSource === 'AUCTION' ? auctionVolume : null
    }
  })

  const payload = { page, pageSize: PAGE_SIZE, total, sort: sort.key, results }

  if (cacheable) {
    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL)
    } catch {}
  }

  return payload
})

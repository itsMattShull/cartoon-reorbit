// GET /api/economy/trending?window=7d|30d|all&hideGtoons=&hidePokemon=&hideHighMints=
// "Trending cToons" — combined trade+auction transaction volume in the window.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { isValidWindow, resolveWindowCutoffSql, MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'
import { parseExclusions, exclusionCacheKey, buildExclusionSql, firstQueryValue } from '@/server/utils/economyFilters'

// Bounded by economyFreshness.js's 300s aggregation gate — a shorter TTL can't
// surface fresher data, it just multiplies cold-cache full aggregates.
const CACHE_TTL = 300
// v2: the key gained an exclusion segment, and the payload's meaning now depends
// on it. A rolling deploy must not serve an unfiltered v1 payload as filtered.
const cacheKey = (window, exKey) => `economy:trending:${window}:${exKey}:v2`

async function computeTrending(window, exclusions) {
  const cutoff = resolveWindowCutoffSql(window)
  return prisma.$queryRaw`
    SELECT
      c."id" AS "ctoonId", c."name", c."assetPath", c."rarity",
      SUM(cpd."volume")::int AS "volume"
    FROM "CtoonPriceDaily" cpd
    JOIN "Ctoon" c ON c."id" = cpd."ctoonId"
    WHERE cpd."date" >= ${cutoff}${buildExclusionSql(exclusions)}
    GROUP BY c."id", c."name", c."assetPath", c."rarity"
    HAVING SUM(cpd."volume") >= ${MIN_SAMPLE_SIZE}
    ORDER BY "volume" DESC, c."name" ASC, c."id" ASC
    LIMIT 10
  `
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const rawWindow = firstQueryValue(query, 'window')
  const window = isValidWindow(rawWindow) ? rawWindow : '7d'
  const exclusions = parseExclusions(query)

  // Exclusions are applied in the WHERE, before GROUP BY/ORDER BY/LIMIT, so
  // ranks 11+ backfill rather than the list simply getting shorter.
  const key = cacheKey(window, exclusionCacheKey(exclusions))
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch {}

  await ensureEconomyDataFresh()

  const trending = await computeTrending(window, exclusions)
  try {
    await redis.set(key, JSON.stringify(trending), 'EX', CACHE_TTL)
  } catch {}

  return trending
})

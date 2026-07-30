// GET /api/economy/top-valuable?source=AUCTION|TRADE&window=7d|30d|all&hideGtoons=&hidePokemon=
// Top 10 most valuable cToons for one source, shown in the two "Top 10"
// modals on the Economy page.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { isValidWindow, isValidSource, resolveWindowCutoffSql, MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'
import { parseExclusions, exclusionCacheKey, buildExclusionSql, firstQueryValue } from '@/server/utils/economyFilters'

// See trending.get.js — bounded by economyFreshness.js's 300s aggregation gate.
const CACHE_TTL = 300
// v2: the key gained an exclusion segment and the payload's meaning depends on
// it, so a rolling deploy must not serve an unfiltered v1 payload as filtered.
const cacheKey = (source, window, exKey) => `economy:top-valuable:${source}:${window}:${exKey}:v2`

async function computeTopValuable(source, window, exclusions) {
  const cutoff = resolveWindowCutoffSql(window)
  // Rows with a NULL avgPrice are activity that couldn't be priced, so they're
  // excluded from both the weighted average and the sample-size test — a cToon
  // shouldn't rank as "most valuable" on the strength of unpriced trades.
  return prisma.$queryRaw`
    SELECT
      c."id" AS "ctoonId", c."name", c."assetPath", c."rarity",
      (SUM(cpd."avgPrice" * cpd."volume") FILTER (WHERE cpd."avgPrice" IS NOT NULL)
        / NULLIF(SUM(cpd."volume") FILTER (WHERE cpd."avgPrice" IS NOT NULL), 0))::float AS "avgPrice",
      SUM(cpd."volume")::int AS "volume"
    FROM "CtoonPriceDaily" cpd
    JOIN "Ctoon" c ON c."id" = cpd."ctoonId"
    WHERE cpd."source" = ${source}::"EconomySource"
      AND cpd."date" >= ${cutoff}${buildExclusionSql(exclusions)}
    GROUP BY c."id", c."name", c."assetPath", c."rarity"
    HAVING SUM(cpd."volume") FILTER (WHERE cpd."avgPrice" IS NOT NULL) >= ${MIN_SAMPLE_SIZE}
    ORDER BY "avgPrice" DESC, c."name" ASC, c."id" ASC
    LIMIT 10
  `
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const rawSource = firstQueryValue(query, 'source')
  const rawWindow = firstQueryValue(query, 'window')
  const source = isValidSource(rawSource) ? rawSource : 'AUCTION'
  const window = isValidWindow(rawWindow) ? rawWindow : 'all'
  const exclusions = parseExclusions(query)

  const key = cacheKey(source, window, exclusionCacheKey(exclusions))
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch {}

  await ensureEconomyDataFresh()

  const topValuable = await computeTopValuable(source, window, exclusions)
  try {
    await redis.set(key, JSON.stringify(topValuable), 'EX', CACHE_TTL)
  } catch {}

  return topValuable
})

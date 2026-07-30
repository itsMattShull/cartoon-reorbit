// GET /api/economy/top-valuable?source=AUCTION|TRADE&window=7d|30d|all
// Top 10 most valuable cToons for one source, shown in the two "Top 10"
// modals on the Economy page.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { isValidWindow, isValidSource, resolveWindowCutoffSql, MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'

const CACHE_TTL = 60
const cacheKey = (source, window) => `economy:top-valuable:${source}:${window}:v1`

async function computeTopValuable(source, window) {
  const cutoff = resolveWindowCutoffSql(window)
  return prisma.$queryRaw`
    SELECT
      c."id" AS "ctoonId", c."name", c."assetPath", c."rarity",
      (SUM(cpd."avgPrice" * cpd."volume") / SUM(cpd."volume"))::float AS "avgPrice",
      SUM(cpd."volume")::int AS "volume"
    FROM "CtoonPriceDaily" cpd
    JOIN "Ctoon" c ON c."id" = cpd."ctoonId"
    WHERE cpd."source" = ${source}::"EconomySource" AND cpd."date" >= ${cutoff}
    GROUP BY c."id", c."name", c."assetPath", c."rarity"
    HAVING SUM(cpd."volume") >= ${MIN_SAMPLE_SIZE}
    ORDER BY "avgPrice" DESC
    LIMIT 10
  `
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const rawSource = Array.isArray(query.source) ? query.source[0] : query.source
  const rawWindow = Array.isArray(query.window) ? query.window[0] : query.window
  const source = isValidSource(rawSource) ? rawSource : 'AUCTION'
  const window = isValidWindow(rawWindow) ? rawWindow : 'all'

  const key = cacheKey(source, window)
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch {}

  await ensureEconomyDataFresh()

  const topValuable = await computeTopValuable(source, window)
  try {
    await redis.set(key, JSON.stringify(topValuable), 'EX', CACHE_TTL)
  } catch {}

  return topValuable
})

// GET /api/economy/trending?window=7d|30d|all
// "Trending cToons" — combined trade+auction transaction volume in the window.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { isValidWindow, resolveWindowCutoffSql, MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'

const CACHE_TTL = 60
const cacheKey = (window) => `economy:trending:${window}:v1`

async function computeTrending(window) {
  const cutoff = resolveWindowCutoffSql(window)
  return prisma.$queryRaw`
    SELECT
      c."id" AS "ctoonId", c."name", c."assetPath", c."rarity",
      SUM(cpd."volume")::int AS "volume"
    FROM "CtoonPriceDaily" cpd
    JOIN "Ctoon" c ON c."id" = cpd."ctoonId"
    WHERE cpd."date" >= ${cutoff}
    GROUP BY c."id", c."name", c."assetPath", c."rarity"
    HAVING SUM(cpd."volume") >= ${MIN_SAMPLE_SIZE}
    ORDER BY "volume" DESC
    LIMIT 10
  `
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const rawWindow = Array.isArray(query.window) ? query.window[0] : query.window
  const window = isValidWindow(rawWindow) ? rawWindow : '7d'

  const key = cacheKey(window)
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch {}

  await ensureEconomyDataFresh()

  const trending = await computeTrending(window)
  try {
    await redis.set(key, JSON.stringify(trending), 'EX', CACHE_TTL)
  } catch {}

  return trending
})

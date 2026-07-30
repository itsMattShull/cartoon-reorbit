// GET /api/economy/ctoons/:id/history?source=AUCTION|TRADE
// Per-cToon price-history series for the chart modal, from release to today.
// Auto-coarsens: daily buckets for a short history, weekly for a longer one,
// monthly beyond ~2 years, so old cToons don't render thousands of points.
import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { isValidSource, MIN_SAMPLE_SIZE } from '@/server/utils/economyValuation'

function bucketKey(date, granularity) {
  const d = new Date(date)
  if (granularity === 'day') return d.toISOString().slice(0, 10)
  if (granularity === 'week') {
    const dow = (d.getUTCDay() + 6) % 7 // 0 = Monday
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow))
    return monday.toISOString().slice(0, 10)
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function chooseGranularity(rows) {
  if (rows.length < 2) return 'day'
  const spanDays = (new Date(rows[rows.length - 1].date) - new Date(rows[0].date)) / (1000 * 60 * 60 * 24)
  if (spanDays <= 90) return 'day'
  if (spanDays <= 730) return 'week'
  return 'month'
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const ctoonId = getRouterParam(event, 'id')
  if (!ctoonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cToon id' })
  }

  const query = getQuery(event)
  const rawSource = Array.isArray(query.source) ? query.source[0] : query.source
  const source = isValidSource(rawSource) ? rawSource : 'AUCTION'

  const ctoon = await prisma.ctoon.findUnique({
    where: { id: ctoonId },
    select: { id: true, name: true, assetPath: true, releaseDate: true, createdAt: true }
  })
  if (!ctoon) {
    throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
  }

  const rows = await prisma.ctoonPriceDaily.findMany({
    where: { ctoonId, source },
    select: { date: true, avgPrice: true, volume: true },
    orderBy: { date: 'asc' }
  })

  const granularity = chooseGranularity(rows)

  const buckets = new Map()
  for (const row of rows) {
    const key = bucketKey(row.date, granularity)
    const bucket = buckets.get(key) || { key, weightedSum: 0, volume: 0 }
    bucket.weightedSum += row.avgPrice * row.volume
    bucket.volume += row.volume
    buckets.set(key, bucket)
  }

  const points = [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      period: b.key,
      volume: b.volume,
      avgPrice: b.volume >= MIN_SAMPLE_SIZE ? Math.round((b.weightedSum / b.volume) * 100) / 100 : null,
      insufficientData: b.volume < MIN_SAMPLE_SIZE
    }))

  return {
    ctoonId: ctoon.id,
    name: ctoon.name,
    assetPath: ctoon.assetPath,
    releaseDate: ctoon.releaseDate || ctoon.createdAt,
    source,
    granularity,
    points
  }
})

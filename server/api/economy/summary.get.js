// GET /api/economy/summary
// Top-of-page stat tiles for the Economy page: average points per player and
// overall trade/auction volume (all-time counts, not filtered by window).
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_KEY = 'economy:summary:v1'
const CACHE_TTL = 60 // seconds — matches the page's polling interval, no point hitting Postgres more often

async function computeSummary() {
  const [pointsAgg, totalTradeVolume, totalAuctionVolume] = await Promise.all([
    prisma.$queryRaw`
      SELECT AVG(up."points")::float AS "avgPoints"
      FROM "UserPoints" up
      JOIN "User" u ON u.id = up."userId"
      WHERE u."active" = true AND COALESCE(u."banned", false) = false
    `,
    prisma.tradeOffer.count({ where: { status: 'ACCEPTED' } }),
    prisma.auction.count({ where: { status: 'CLOSED', winnerId: { not: null } } })
  ])

  return {
    avgPointsPerPlayer: Math.round((pointsAgg[0]?.avgPoints || 0) * 100) / 100,
    totalTradeVolume,
    totalAuctionVolume
  }
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  const summary = await computeSummary()
  try {
    await redis.set(CACHE_KEY, JSON.stringify(summary), 'EX', CACHE_TTL)
  } catch {}

  return summary
})

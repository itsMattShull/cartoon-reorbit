// GET /api/economy/summary
// Top-of-page stat tiles for the Economy page: average points per player,
// overall trade/auction volume, and net points issued over the last 7 days.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const CACHE_KEY = 'economy:summary:v2'
const CACHE_TTL = 60 // seconds — matches the page's polling interval, no point hitting Postgres more often

async function computeSummary() {
  const [pointsAgg, totalTradeVolume, totalAuctionVolume, netPointsAgg] = await Promise.all([
    // Median alongside the mean: point balances are heavily right-skewed, so the
    // mean alone overstates what a typical player actually holds.
    prisma.$queryRaw`
      SELECT
        AVG(up."points")::float AS "avgPoints",
        (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY up."points"))::float AS "medianPoints"
      FROM "UserPoints" up
      JOIN "User" u ON u.id = up."userId"
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
    `,
    prisma.tradeOffer.count({ where: { status: 'ACCEPTED' } }),
    prisma.auction.count({ where: { status: 'CLOSED', winnerId: { not: null } } }),
    prisma.$queryRaw`
      SELECT
        SUM(CASE WHEN "direction" = 'increase' THEN "points" ELSE 0 END)::bigint AS "earned",
        SUM(CASE WHEN "direction" = 'decrease' THEN "points" ELSE 0 END)::bigint AS "spent"
      FROM "PointsLog"
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
    `
  ])

  const earned = Number(netPointsAgg[0]?.earned || 0)
  const spent = Number(netPointsAgg[0]?.spent || 0)

  return {
    avgPointsPerPlayer: Math.round((pointsAgg[0]?.avgPoints || 0) * 100) / 100,
    medianPointsPerPlayer: Math.round(pointsAgg[0]?.medianPoints || 0),
    totalTradeVolume,
    totalAuctionVolume,
    netPoints7d: earned - spent
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

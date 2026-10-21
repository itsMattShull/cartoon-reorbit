// GET /api/economy/summary
// Top-of-page stat tiles for the Economy page: average points per active player,
// overall trade/auction volume, and net points issued over the last 7 days.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { activeDailyTaskUsersFragment } from '@/server/utils/activeDailyTaskUsers'
import { getActivePlayerPointsStats, ACTIVE_PLAYER_WINDOW_DAYS } from '@/server/utils/activePlayers'

const CACHE_KEY = 'economy:summary:v5'
const CACHE_TTL = 60 // seconds — matches the page's polling interval, no point hitting Postgres more often

async function computeSummary() {
  const activeUsersSql = await activeDailyTaskUsersFragment()

  const [pointsStats, totalTradeVolume, totalAuctionVolume, netPointsAgg] = await Promise.all([
    getActivePlayerPointsStats(),
    prisma.tradeOffer.count({ where: { status: 'ACCEPTED' } }),
    prisma.auction.count({ where: { status: 'CLOSED', winnerId: { not: null } } }),
    // Restricted to accounts that were actually active (completed at least one
    // daily task, per activeDailyTaskUsersFragment) sometime in the window —
    // otherwise this counts points issued to accounts that did nothing that
    // week and inflates the figure.
    prisma.$queryRaw`
      SELECT
        SUM(CASE WHEN "direction" = 'increase' THEN "points" ELSE 0 END)::bigint AS "earned",
        SUM(CASE WHEN "direction" = 'decrease' THEN "points" ELSE 0 END)::bigint AS "spent"
      FROM "PointsLog"
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        AND "userId" IN (${activeUsersSql})
    `
  ])

  const earned = Number(netPointsAgg[0]?.earned || 0)
  const spent = Number(netPointsAgg[0]?.spent || 0)

  return {
    avgPointsPerPlayer: pointsStats.avgPoints,
    medianPointsPerPlayer: pointsStats.medianPoints,
    activePlayerWindowDays: ACTIVE_PLAYER_WINDOW_DAYS,
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

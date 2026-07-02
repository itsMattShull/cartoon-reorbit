import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_KEY  = 'reorbitmatch:leaderboard'
const CACHE_TTL  = 1800  // 30 minutes
const EXCLUDE_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

async function fetchLeaderboards() {
  const [allTime, monthly, weekly] = await Promise.all([
    prisma.$queryRaw`
      SELECT u."username", MAX(s."score")::int AS score
      FROM "ReOrbitMatchScore" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND s."userId" <> ${EXCLUDE_ID}
      GROUP BY u."id", u."username"
      ORDER BY score DESC, u."username" ASC
      LIMIT 10
    `,
    prisma.$queryRaw`
      SELECT u."username", MAX(s."score")::int AS score
      FROM "ReOrbitMatchScore" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE s."createdAt" >= NOW() - INTERVAL '30 days'
        AND u."active" = true
        AND COALESCE(u."banned", false) = false
        AND s."userId" <> ${EXCLUDE_ID}
      GROUP BY u."id", u."username"
      ORDER BY score DESC, u."username" ASC
      LIMIT 10
    `,
    prisma.$queryRaw`
      SELECT u."username", MAX(s."score")::int AS score
      FROM "ReOrbitMatchScore" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE s."createdAt" >= NOW() - INTERVAL '7 days'
        AND u."active" = true
        AND COALESCE(u."banned", false) = false
        AND s."userId" <> ${EXCLUDE_ID}
      GROUP BY u."id", u."username"
      ORDER BY score DESC, u."username" ASC
      LIMIT 10
    `,
  ])

  return {
    allTime: allTime.map(r => ({ username: r.username, score: Number(r.score) })),
    monthly: monthly.map(r => ({ username: r.username, score: Number(r.score) })),
    weekly:  weekly.map(r =>  ({ username: r.username, score: Number(r.score) })),
  }
}

export default defineEventHandler(async () => {
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  const data = await fetchLeaderboards()

  try {
    await redis.set(CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL)
  } catch {}

  return data
})

// server/api/leaderboard/trending-earners.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'
import { cachedJson } from '@/server/utils/cache'

const LEADERBOARD_TTL_SEC = 60

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

function rankedTop11() {
  return prisma.$queryRaw`
    SELECT u."id" AS "userId", u."username", u."avatar",
           SUM(pl."points")::int AS "points",
           (ROW_NUMBER() OVER (ORDER BY SUM(pl."points") DESC, u."username" ASC))::int AS rank
    FROM "PointsLog" pl
    JOIN "User" u ON u."id" = pl."userId"
    WHERE pl."direction" = 'increase'
      AND pl."createdAt" >= NOW() - INTERVAL '7 days'
      AND u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDE_USER_ID}
    GROUP BY u."id", u."username", u."avatar"
    ORDER BY rank
    LIMIT 11;
  `
}

function rankedViewer(userId) {
  return prisma.$queryRaw`
    WITH ranked AS (
      SELECT u."id" AS "userId", u."username", u."avatar",
             SUM(pl."points")::int AS "points",
             (ROW_NUMBER() OVER (ORDER BY SUM(pl."points") DESC, u."username" ASC))::int AS rank
      FROM "PointsLog" pl
      JOIN "User" u ON u."id" = pl."userId"
      WHERE pl."direction" = 'increase'
        AND pl."createdAt" >= NOW() - INTERVAL '7 days'
        AND u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDE_USER_ID}
      GROUP BY u."id", u."username", u."avatar"
    )
    SELECT * FROM ranked WHERE "userId" = ${userId};
  `
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null

  // Cached (Redis, single-flight): the ranking is a full-table aggregate and every visitor asks for it.
  const top11 = await cachedJson('lb:trending-earners:top11', LEADERBOARD_TTL_SEC, rankedTop11)
  let viewerRow = null
  if (userId && !top11.some(r => r.userId === userId)) {
    const res = await cachedJson(`lb:trending-earners:viewer:${userId}`, LEADERBOARD_TTL_SEC, () => rankedViewer(userId))
    viewerRow = res[0] || null
  }

  return mergeViewerRow(top11, viewerRow, userId)
})

// server/api/points-leaderboard.get.js

import { defineEventHandler } from 'h3'

import { prisma } from '@/server/prisma'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'
import { cachedJson } from '@/server/utils/cache'

const LEADERBOARD_TTL_SEC = 60

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

function rankedTop11() {
  return prisma.$queryRaw`
    SELECT u."id" AS "userId", u."username", u."avatar", up."points"::int AS "points",
           (ROW_NUMBER() OVER (ORDER BY up."points" DESC, u."username" ASC))::int AS rank
    FROM "UserPoints" up
    JOIN "User" u ON u."id" = up."userId"
    WHERE u."id" <> ${EXCLUDE_USER_ID}
    ORDER BY rank
    LIMIT 11;
  `
}

function rankedViewer(userId) {
  return prisma.$queryRaw`
    WITH ranked AS (
      SELECT u."id" AS "userId", u."username", u."avatar", up."points"::int AS "points",
             (ROW_NUMBER() OVER (ORDER BY up."points" DESC, u."username" ASC))::int AS rank
      FROM "UserPoints" up
      JOIN "User" u ON u."id" = up."userId"
      WHERE u."id" <> ${EXCLUDE_USER_ID}
    )
    SELECT * FROM ranked WHERE "userId" = ${userId};
  `
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null

  // Cached (Redis, single-flight): the ranking is a full-table aggregate and every visitor asks for it.
  const top11 = await cachedJson('lb:points:top11', LEADERBOARD_TTL_SEC, rankedTop11)
  let viewerRow = null
  if (userId && !top11.some(r => r.userId === userId)) {
    const res = await cachedJson(`lb:points:viewer:${userId}`, LEADERBOARD_TTL_SEC, () => rankedViewer(userId))
    viewerRow = res[0] || null
  }

  return mergeViewerRow(top11, viewerRow, userId)
})

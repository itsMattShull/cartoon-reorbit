// server/api/points-leaderboard.get.js

import { defineEventHandler } from 'h3'

import { prisma } from '@/server/prisma'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'

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

  const top11 = await rankedTop11()
  let viewerRow = null
  if (userId && !top11.some(r => r.userId === userId)) {
    const res = await rankedViewer(userId)
    viewerRow = res[0] || null
  }

  return mergeViewerRow(top11, viewerRow, userId)
})

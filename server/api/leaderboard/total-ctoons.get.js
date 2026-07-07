// server/api/leaderboard/total-ctoons.get.js
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { mergeViewerRow, markSelf, LEADERBOARD_FULL_LIMIT } from '@/server/utils/leaderboardRank'

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

function rankedTop(limit) {
  return prisma.$queryRaw`
    SELECT u."id" AS "userId", u."username", u."avatar",
           COUNT(uc."id")::int AS "count",
           (ROW_NUMBER() OVER (ORDER BY COUNT(uc."id") DESC, u."username" ASC))::int AS rank
    FROM "User" u
    JOIN "UserCtoon" uc ON uc."userId" = u."id"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDE_USER_ID}
      AND uc."burnedAt" IS NULL
    GROUP BY u."id", u."username", u."avatar"
    ORDER BY rank
    LIMIT ${limit};
  `
}

function rankedViewer(userId) {
  return prisma.$queryRaw`
    WITH ranked AS (
      SELECT u."id" AS "userId", u."username", u."avatar",
             COUNT(uc."id")::int AS "count",
             (ROW_NUMBER() OVER (ORDER BY COUNT(uc."id") DESC, u."username" ASC))::int AS rank
      FROM "User" u
      JOIN "UserCtoon" uc ON uc."userId" = u."id"
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDE_USER_ID}
        AND uc."burnedAt" IS NULL
      GROUP BY u."id", u."username", u."avatar"
    )
    SELECT * FROM ranked WHERE "userId" = ${userId};
  `
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null
  const { full } = getQuery(event)

  if (full) {
    const rows = await rankedTop(LEADERBOARD_FULL_LIMIT)
    return markSelf(rows, userId)
  }

  const top11 = await rankedTop(11)
  let viewerRow = null
  if (userId && !top11.some(r => r.userId === userId)) {
    const res = await rankedViewer(userId)
    viewerRow = res[0] || null
  }

  return mergeViewerRow(top11, viewerRow, userId)
})

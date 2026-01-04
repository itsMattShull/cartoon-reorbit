// server/api/leaderboard/trending-earners.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

export default defineEventHandler(async () => {
  const rows = await prisma.$queryRaw`
    SELECT u."username",
           SUM(pl."points")::int AS "points"
    FROM "PointsLog" pl
    JOIN "User" u ON u."id" = pl."userId"
    WHERE pl."direction" = 'increase'
      AND pl."createdAt" >= NOW() - INTERVAL '7 days'
      AND u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDE_USER_ID}
    GROUP BY u."id", u."username"
    ORDER BY "points" DESC, u."username" ASC
    LIMIT 10;
  `

  return rows
})

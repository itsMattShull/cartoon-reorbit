// server/api/leaderboard/unique-ctoons.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

export default defineEventHandler(async () => {
  const rows = await prisma.$queryRaw`
    SELECT u."username",
           COUNT(DISTINCT uc."ctoonId")::int AS "count"
    FROM "User" u
    JOIN "UserCtoon" uc ON uc."userId" = u."id"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDE_USER_ID}
      AND uc."burnedAt" IS NULL
    GROUP BY u."id", u."username"
    ORDER BY "count" DESC, u."username" ASC
    LIMIT 10;
  `
  return rows
})
